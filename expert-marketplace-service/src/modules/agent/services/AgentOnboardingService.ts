import { Logger } from '../../../utils/logger';
import { advancedCacheService } from '../../../services/AdvancedCacheService';
import { AgentProfile } from '../models/AgentProfile.model';
import { WhatsAppService } from './WhatsAppService';
import { notificationService } from '../../../services/NotificationService';
import * as crypto from 'crypto';

const logger = new Logger('AgentOnboardingService');

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  type: 'document_upload' | 'form_completion' | 'verification_call' | 'training_module' | 'assessment';
  required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  completedAt?: Date;
  documents?: {
    id: string;
    name: string;
    type: string;
    url: string;
    verificationStatus: 'pending' | 'verified' | 'rejected';
    rejectionReason?: string;
  }[];
  formData?: Record<string, any>;
  verificationNotes?: string;
  retryCount?: number;
  maxRetries?: number;
}

export interface OnboardingFlow {
  agentId: string;
  flowId: string;
  currentStep: number;
  totalSteps: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed' | 'suspended';
  steps: OnboardingStep[];
  startedAt?: Date;
  completedAt?: Date;
  assignedReviewer?: string;
  completionPercentage: number;
  estimatedCompletionTime?: Date;
}

export interface VerificationRequirement {
  id: string;
  category: 'identity' | 'education' | 'experience' | 'background_check' | 'compliance';
  title: string;
  description: string;
  documentTypes: string[];
  validationCriteria: {
    mustContain?: string[];
    format?: string;
    expiry?: boolean;
    issuer?: string[];
  };
  verificationMethod: 'manual' | 'automated' | 'third_party';
  required: boolean;
  regionSpecific?: string[];
}

export interface BackgroundCheck {
  agentId: string;
  checkId: string;
  type: 'criminal' | 'credit' | 'employment' | 'education' | 'reference';
  status: 'initiated' | 'in_progress' | 'completed' | 'failed';
  provider: string;
  results?: {
    passed: boolean;
    findings: any[];
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
  requestedAt: Date;
  completedAt?: Date;
  validUntil?: Date;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: 'product_knowledge' | 'sales_techniques' | 'compliance' | 'systems_training';
  type: 'video' | 'interactive' | 'document' | 'quiz' | 'webinar';
  duration: number; // minutes
  required: boolean;
  prerequisite?: string[];
  content: {
    url?: string;
    materials?: any[];
    quiz?: {
      questions: any[];
      passingScore: number;
    };
  };
  completionCriteria: {
    timeSpent?: number;
    quizScore?: number;
    attendance?: boolean;
  };
}

export interface AgentAssessment {
  agentId: string;
  assessmentId: string;
  type: 'technical' | 'sales' | 'communication' | 'scenario_based';
  status: 'scheduled' | 'in_progress' | 'completed' | 'failed';
  assessor: string;
  scheduledAt?: Date;
  completedAt?: Date;
  duration: number;
  results?: {
    score: number;
    maxScore: number;
    percentage: number;
    strengths: string[];
    improvementAreas: string[];
    recommendation: 'approve' | 'conditional_approve' | 'reject' | 'retrain';
    notes: string;
  };
}

export class AgentOnboardingService {

  /**
   * Initialize onboarding flow for new agent
   */
  async initializeOnboarding(
    agentId: string,
    region: string = 'global',
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' = 'bronze'
  ): Promise<OnboardingFlow> {
    try {
      const agent = await AgentProfile.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const flowId = `onboarding_${agentId}_${Date.now()}`;
      const steps = await this.createOnboardingSteps(region, tier);

      const onboardingFlow: OnboardingFlow = {
        agentId,
        flowId,
        currentStep: 0,
        totalSteps: steps.length,
        status: 'not_started',
        steps,
        completionPercentage: 0,
        estimatedCompletionTime: this.calculateEstimatedCompletion(steps)
      };

      // Store onboarding flow
      await advancedCacheService.set(`onboarding_flow:${flowId}`, onboardingFlow, {
        ttl: 86400 * 30, // 30 days
        tags: ['onboarding', `agent:${agentId}`]
      });

      // Update agent status
      await AgentProfile.findByIdAndUpdate(agentId, {
        'onboarding.status': 'initiated',
        'onboarding.flowId': flowId,
        'onboarding.startedAt': new Date()
      });

      // Send welcome notification
      await this.sendWelcomeNotification(agent);

      logger.info('Onboarding initialized', { agentId, flowId });
      return onboardingFlow;
    } catch (error) {
      logger.error('Error initializing onboarding:', error);
      throw error;
    }
  }

  /**
   * Get onboarding flow status
   */
  async getOnboardingFlow(flowId: string): Promise<OnboardingFlow | null> {
    try {
      return await advancedCacheService.get<OnboardingFlow>(`onboarding_flow:${flowId}`);
    } catch (error) {
      logger.error('Error getting onboarding flow:', error);
      return null;
    }
  }

  /**
   * Complete onboarding step
   */
  async completeStep(
    flowId: string,
    stepId: string,
    data?: {
      formData?: Record<string, any>;
      documents?: any[];
      verificationNotes?: string;
    }
  ): Promise<OnboardingFlow> {
    try {
      const flow = await this.getOnboardingFlow(flowId);
      if (!flow) {
        throw new Error('Onboarding flow not found');
      }

      const stepIndex = flow.steps.findIndex(step => step.id === stepId);
      if (stepIndex === -1) {
        throw new Error('Step not found');
      }

      const step = flow.steps[stepIndex];
      
      // Update step data
      if (data?.formData) step.formData = data.formData;
      if (data?.documents) step.documents = data.documents;
      if (data?.verificationNotes) step.verificationNotes = data.verificationNotes;

      // Validate step completion
      const isValid = await this.validateStepCompletion(step, data);
      
      if (isValid) {
        step.status = 'completed';
        step.completedAt = new Date();
        
        // Move to next step if current
        if (stepIndex === flow.currentStep) {
          flow.currentStep = Math.min(flow.currentStep + 1, flow.totalSteps - 1);
        }
      } else {
        step.status = 'failed';
        step.retryCount = (step.retryCount || 0) + 1;
      }

      // Update completion percentage
      flow.completionPercentage = this.calculateCompletionPercentage(flow);

      // Check if flow is complete
      if (flow.completionPercentage === 100) {
        flow.status = 'completed';
        flow.completedAt = new Date();
        await this.finalizeOnboarding(flow);
      } else if (flow.currentStep >= flow.totalSteps) {
        flow.status = 'in_progress';
      }

      // Save updated flow
      await advancedCacheService.set(`onboarding_flow:${flowId}`, flow, {
        ttl: 86400 * 30,
        tags: ['onboarding', `agent:${flow.agentId}`]
      });

      // Send progress notification
      await this.sendProgressNotification(flow, step);

      return flow;
    } catch (error) {
      logger.error('Error completing step:', error);
      throw error;
    }
  }

  /**
   * Submit documents for verification
   */
  async submitDocuments(
    agentId: string,
    stepId: string,
    documents: {
      type: string;
      name: string;
      url: string;
      metadata?: Record<string, any>;
    }[]
  ): Promise<void> {
    try {
      // Find agent's onboarding flow
      const agent = await AgentProfile.findById(agentId);
      if (!agent?.onboarding?.flowId) {
        throw new Error('No active onboarding flow found');
      }

      const flow = await this.getOnboardingFlow(agent.onboarding.flowId);
      if (!flow) {
        throw new Error('Onboarding flow not found');
      }

      const step = flow.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error('Step not found');
      }

      // Process each document
      const processedDocuments = [];
      for (const doc of documents) {
        const documentRecord = {
          id: crypto.randomBytes(16).toString('hex'),
          name: doc.name,
          type: doc.type,
          url: doc.url,
          verificationStatus: 'pending' as const,
          uploadedAt: new Date()
        };

        // Auto-verify if criteria met
        const autoVerification = await this.attemptAutoVerification(doc);
        if (autoVerification.canAutoVerify) {
          documentRecord.verificationStatus = autoVerification.status;
        }

        processedDocuments.push(documentRecord);
      }

      step.documents = processedDocuments;
      step.status = 'in_progress';

      // Save flow
      await advancedCacheService.set(`onboarding_flow:${flow.flowId}`, flow, {
        ttl: 86400 * 30,
        tags: ['onboarding', `agent:${agentId}`]
      });

      // Queue for manual verification if needed
      const needsManualReview = processedDocuments.some(doc => doc.verificationStatus === 'pending');
      if (needsManualReview) {
        await this.queueForManualVerification(agentId, stepId, processedDocuments);
      }

      logger.info('Documents submitted for verification', { agentId, stepId, documentCount: documents.length });
    } catch (error) {
      logger.error('Error submitting documents:', error);
      throw error;
    }
  }

  /**
   * Initiate background check
   */
  async initiateBackgroundCheck(
    agentId: string,
    checkTypes: ('criminal' | 'credit' | 'employment' | 'education' | 'reference')[] = ['criminal']
  ): Promise<BackgroundCheck[]> {
    try {
      const checks: BackgroundCheck[] = [];

      for (const checkType of checkTypes) {
        const checkId = `bg_${checkType}_${agentId}_${Date.now()}`;
        
        const backgroundCheck: BackgroundCheck = {
          agentId,
          checkId,
          type: checkType,
          status: 'initiated',
          provider: this.getBackgroundCheckProvider(checkType),
          requestedAt: new Date(),
          validUntil: new Date(Date.now() + 86400000 * 365) // Valid for 1 year
        };

        // Store background check
        await advancedCacheService.set(`background_check:${checkId}`, backgroundCheck, {
          ttl: 86400 * 365, // 1 year
          tags: ['background_check', `agent:${agentId}`]
        });

        // Initiate actual check with third-party provider
        await this.initiateThirdPartyBackgroundCheck(backgroundCheck);

        checks.push(backgroundCheck);
      }

      logger.info('Background checks initiated', { agentId, checkTypes });
      return checks;
    } catch (error) {
      logger.error('Error initiating background check:', error);
      throw error;
    }
  }

  /**
   * Create training modules for agent
   */
  async assignTrainingModules(
    agentId: string,
    region: string = 'global',
    tier: string = 'bronze'
  ): Promise<TrainingModule[]> {
    try {
      const modules = await this.getRequiredTrainingModules(region, tier);

      // Store training assignment
      await advancedCacheService.set(`training_modules:${agentId}`, modules, {
        ttl: 86400 * 30,
        tags: ['training', `agent:${agentId}`]
      });

      // Send training notification
      await this.sendTrainingNotification(agentId, modules);

      logger.info('Training modules assigned', { agentId, moduleCount: modules.length });
      return modules;
    } catch (error) {
      logger.error('Error assigning training modules:', error);
      throw error;
    }
  }

  /**
   * Schedule agent assessment
   */
  async scheduleAssessment(
    agentId: string,
    assessmentType: 'technical' | 'sales' | 'communication' | 'scenario_based',
    assessorId: string,
    scheduledAt: Date
  ): Promise<AgentAssessment> {
    try {
      const assessmentId = `assessment_${assessmentType}_${agentId}_${Date.now()}`;

      const assessment: AgentAssessment = {
        agentId,
        assessmentId,
        type: assessmentType,
        status: 'scheduled',
        assessor: assessorId,
        scheduledAt,
        duration: this.getAssessmentDuration(assessmentType)
      };

      // Store assessment
      await advancedCacheService.set(`assessment:${assessmentId}`, assessment, {
        ttl: 86400 * 7, // 7 days
        tags: ['assessment', `agent:${agentId}`, `assessor:${assessorId}`]
      });

      // Send calendar invitation
      await this.sendAssessmentInvitation(assessment);

      logger.info('Assessment scheduled', { agentId, assessmentType, scheduledAt });
      return assessment;
    } catch (error) {
      logger.error('Error scheduling assessment:', error);
      throw error;
    }
  }

  /**
   * Complete agent assessment with results
   */
  async completeAssessment(
    assessmentId: string,
    results: {
      score: number;
      maxScore: number;
      strengths: string[];
      improvementAreas: string[];
      recommendation: 'approve' | 'conditional_approve' | 'reject' | 'retrain';
      notes: string;
    }
  ): Promise<AgentAssessment> {
    try {
      const assessment = await advancedCacheService.get<AgentAssessment>(`assessment:${assessmentId}`);
      if (!assessment) {
        throw new Error('Assessment not found');
      }

      assessment.status = 'completed';
      assessment.completedAt = new Date();
      assessment.results = {
        ...results,
        percentage: (results.score / results.maxScore) * 100
      };

      // Update assessment
      await advancedCacheService.set(`assessment:${assessmentId}`, assessment, {
        ttl: 86400 * 365, // Keep results for 1 year
        tags: ['assessment', `agent:${assessment.agentId}`]
      });

      // Update agent profile with assessment results
      await this.updateAgentWithAssessmentResults(assessment);

      // Send results notification
      await this.sendAssessmentResultsNotification(assessment);

      logger.info('Assessment completed', { assessmentId, recommendation: results.recommendation });
      return assessment;
    } catch (error) {
      logger.error('Error completing assessment:', error);
      throw error;
    }
  }

  /**
   * Get agent onboarding dashboard
   */
  async getAgentOnboardingDashboard(agentId: string): Promise<any> {
    try {
      const agent = await AgentProfile.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const [
        onboardingFlow,
        trainingModules,
        backgroundChecks,
        assessments
      ] = await Promise.all([
        agent.onboarding?.flowId ? this.getOnboardingFlow(agent.onboarding.flowId) : null,
        advancedCacheService.get(`training_modules:${agentId}`),
        this.getAgentBackgroundChecks(agentId),
        this.getAgentAssessments(agentId)
      ]);

      return {
        agent: {
          id: agentId,
          name: agent.personalInfo.fullName,
          email: agent.personalInfo.email,
          status: agent.status,
          tier: agent.tier,
          joinedAt: agent.createdAt
        },
        onboarding: onboardingFlow,
        training: trainingModules,
        backgroundChecks,
        assessments,
        nextSteps: await this.getNextSteps(agentId, onboardingFlow)
      };
    } catch (error) {
      logger.error('Error getting agent dashboard:', error);
      throw error;
    }
  }

  // Private helper methods

  private async createOnboardingSteps(region: string, tier: string): Promise<OnboardingStep[]> {
    const baseSteps: OnboardingStep[] = [
      {
        id: 'personal_info',
        title: 'Personal Information',
        description: 'Complete your personal and contact information',
        type: 'form_completion',
        required: true,
        status: 'pending'
      },
      {
        id: 'identity_verification',
        title: 'Identity Verification',
        description: 'Upload government-issued ID and proof of address',
        type: 'document_upload',
        required: true,
        status: 'pending',
        maxRetries: 3
      },
      {
        id: 'background_check',
        title: 'Background Check',
        description: 'Consent to background verification process',
        type: 'verification_call',
        required: true,
        status: 'pending'
      },
      {
        id: 'product_training',
        title: 'Product Training',
        description: 'Complete required training modules',
        type: 'training_module',
        required: true,
        status: 'pending'
      },
      {
        id: 'assessment',
        title: 'Skills Assessment',
        description: 'Complete skills and knowledge assessment',
        type: 'assessment',
        required: true,
        status: 'pending'
      }
    ];

    // Add tier-specific steps
    if (tier === 'gold' || tier === 'platinum') {
      baseSteps.push({
        id: 'advanced_training',
        title: 'Advanced Training',
        description: 'Complete advanced sales and product training',
        type: 'training_module',
        required: true,
        status: 'pending'
      });
    }

    if (tier === 'platinum') {
      baseSteps.push({
        id: 'leadership_assessment',
        title: 'Leadership Assessment',
        description: 'Complete leadership and mentoring assessment',
        type: 'assessment',
        required: true,
        status: 'pending'
      });
    }

    return baseSteps;
  }

  private calculateEstimatedCompletion(steps: OnboardingStep[]): Date {
    // Estimate completion time based on step types
    const estimatedDays = steps.reduce((total, step) => {
      switch (step.type) {
        case 'form_completion': return total + 0.1;
        case 'document_upload': return total + 0.5;
        case 'verification_call': return total + 2;
        case 'training_module': return total + 1;
        case 'assessment': return total + 1;
        default: return total + 0.5;
      }
    }, 0);

    return new Date(Date.now() + estimatedDays * 86400000);
  }

  private async validateStepCompletion(step: OnboardingStep, data?: any): Promise<boolean> {
    switch (step.type) {
      case 'form_completion':
        return this.validateFormCompletion(step, data?.formData);
      case 'document_upload':
        return this.validateDocumentUpload(step);
      case 'verification_call':
        return this.validateVerificationCall(step);
      case 'training_module':
        return this.validateTrainingCompletion(step);
      case 'assessment':
        return this.validateAssessmentCompletion(step);
      default:
        return false;
    }
  }

  private validateFormCompletion(step: OnboardingStep, formData?: Record<string, any>): boolean {
    // Validate required form fields based on step requirements
    return formData && Object.keys(formData).length > 0;
  }

  private validateDocumentUpload(step: OnboardingStep): boolean {
    return step.documents && step.documents.length > 0 && 
           step.documents.every(doc => doc.verificationStatus === 'verified');
  }

  private validateVerificationCall(step: OnboardingStep): boolean {
    return step.verificationNotes && step.verificationNotes.length > 0;
  }

  private validateTrainingCompletion(step: OnboardingStep): boolean {
    // Check if all required training modules are completed
    return step.status === 'completed';
  }

  private validateAssessmentCompletion(step: OnboardingStep): boolean {
    // Check if assessment was passed
    return step.status === 'completed';
  }

  private calculateCompletionPercentage(flow: OnboardingFlow): number {
    const completedSteps = flow.steps.filter(step => step.status === 'completed').length;
    return Math.round((completedSteps / flow.totalSteps) * 100);
  }

  private async finalizeOnboarding(flow: OnboardingFlow): Promise<void> {
    // Update agent status to active
    await AgentProfile.findByIdAndUpdate(flow.agentId, {
      status: 'active',
      'onboarding.status': 'completed',
      'onboarding.completedAt': new Date()
    });

    // Send completion notification
    await this.sendCompletionNotification(flow);

    // Assign initial leads if applicable
    await this.assignInitialLeads(flow.agentId);
  }

  private async sendWelcomeNotification(agent: any): Promise<void> {
    await notificationService.sendNotification({
      userId: agent._id,
      type: 'onboarding_welcome',
      title: 'Welcome to FoodXchange Agent Program!',
      message: 'Your onboarding journey has begun. Complete all steps to start earning commissions.',
      priority: 'medium',
      channels: ['email', 'whatsapp']
    });
  }

  private async sendProgressNotification(flow: OnboardingFlow, step: OnboardingStep): Promise<void> {
    if (step.status === 'completed') {
      await notificationService.sendNotification({
        userId: flow.agentId,
        type: 'onboarding_progress',
        title: 'Step Completed!',
        message: `You've completed "${step.title}". ${flow.totalSteps - flow.currentStep - 1} steps remaining.`,
        priority: 'low',
        channels: ['in_app']
      });
    }
  }

  private async sendCompletionNotification(flow: OnboardingFlow): Promise<void> {
    await notificationService.sendNotification({
      userId: flow.agentId,
      type: 'onboarding_complete',
      title: 'Onboarding Complete!',
      message: 'Congratulations! You\'re now an active FoodXchange agent and can start earning commissions.',
      priority: 'high',
      channels: ['email', 'whatsapp', 'sms']
    });
  }

  private async attemptAutoVerification(document: any): Promise<{ canAutoVerify: boolean; status: 'verified' | 'rejected' }> {
    // Mock auto-verification logic
    // In production, integrate with document verification services
    return {
      canAutoVerify: Math.random() > 0.7,
      status: Math.random() > 0.2 ? 'verified' : 'rejected'
    };
  }

  private async queueForManualVerification(agentId: string, stepId: string, documents: any[]): Promise<void> {
    // Queue documents for manual review
    const reviewItem = {
      agentId,
      stepId,
      documents,
      queuedAt: new Date(),
      priority: 'normal'
    };

    await advancedCacheService.set(`manual_review:${agentId}:${stepId}`, reviewItem, {
      ttl: 86400 * 7,
      tags: ['manual_review', 'pending']
    });
  }

  private getBackgroundCheckProvider(checkType: string): string {
    const providers = {
      criminal: 'CriminalCheck Pro',
      credit: 'Credit Verify Inc',
      employment: 'WorkHistory Solutions',
      education: 'EduVerify',
      reference: 'RefCheck Services'
    };
    return providers[checkType] || 'Generic Background Check';
  }

  private async initiateThirdPartyBackgroundCheck(backgroundCheck: BackgroundCheck): Promise<void> {
    // Mock third-party integration
    // In production, integrate with actual background check providers
    logger.info('Initiated third-party background check', { 
      checkId: backgroundCheck.checkId, 
      provider: backgroundCheck.provider 
    });
  }

  private async getRequiredTrainingModules(region: string, tier: string): Promise<TrainingModule[]> {
    // Mock training modules
    return [
      {
        id: 'product_basics',
        title: 'FoodXchange Platform Basics',
        description: 'Introduction to the FoodXchange platform and services',
        category: 'product_knowledge',
        type: 'video',
        duration: 60,
        required: true,
        content: {
          url: 'https://training.foodxchange.com/product-basics',
          quiz: {
            questions: [],
            passingScore: 80
          }
        },
        completionCriteria: {
          timeSpent: 50,
          quizScore: 80
        }
      }
    ];
  }

  private async sendTrainingNotification(agentId: string, modules: TrainingModule[]): Promise<void> {
    await notificationService.sendNotification({
      userId: agentId,
      type: 'training_assigned',
      title: 'Training Modules Assigned',
      message: `${modules.length} training modules have been assigned. Complete them to progress in onboarding.`,
      priority: 'medium',
      channels: ['email', 'in_app']
    });
  }

  private getAssessmentDuration(assessmentType: string): number {
    const durations = {
      technical: 120,
      sales: 90,
      communication: 60,
      scenario_based: 150
    };
    return durations[assessmentType] || 60;
  }

  private async sendAssessmentInvitation(assessment: AgentAssessment): Promise<void> {
    await notificationService.sendNotification({
      userId: assessment.agentId,
      type: 'assessment_scheduled',
      title: 'Assessment Scheduled',
      message: `Your ${assessment.type} assessment is scheduled for ${assessment.scheduledAt?.toLocaleString()}`,
      priority: 'high',
      channels: ['email', 'calendar']
    });
  }

  private async updateAgentWithAssessmentResults(assessment: AgentAssessment): Promise<void> {
    const updateData: any = {};
    
    if (assessment.results?.recommendation === 'approve') {
      updateData['assessments.' + assessment.type] = {
        status: 'passed',
        score: assessment.results.percentage,
        completedAt: assessment.completedAt
      };
    }

    await AgentProfile.findByIdAndUpdate(assessment.agentId, updateData);
  }

  private async sendAssessmentResultsNotification(assessment: AgentAssessment): Promise<void> {
    const passed = assessment.results?.recommendation === 'approve';
    
    await notificationService.sendNotification({
      userId: assessment.agentId,
      type: 'assessment_results',
      title: `Assessment ${passed ? 'Passed' : 'Results Available'}`,
      message: passed ? 
        'Congratulations! You passed your assessment.' : 
        'Your assessment results are available. Please review feedback.',
      priority: 'medium',
      channels: ['email', 'in_app']
    });
  }

  private async getAgentBackgroundChecks(agentId: string): Promise<BackgroundCheck[]> {
    // Implementation would query stored background checks
    return [];
  }

  private async getAgentAssessments(agentId: string): Promise<AgentAssessment[]> {
    // Implementation would query stored assessments
    return [];
  }

  private async getNextSteps(agentId: string, flow: OnboardingFlow | null): Promise<string[]> {
    if (!flow || flow.status === 'completed') {
      return ['Start generating leads and earning commissions!'];
    }

    const nextSteps = [];
    const currentStep = flow.steps[flow.currentStep];
    
    if (currentStep) {
      nextSteps.push(`Complete: ${currentStep.title}`);
    }

    const pendingSteps = flow.steps.filter(step => step.status === 'pending').slice(0, 3);
    nextSteps.push(...pendingSteps.map(step => step.title));

    return nextSteps;
  }

  private async assignInitialLeads(agentId: string): Promise<void> {
    // Assign some starter leads to new agent
    logger.info('Assigning initial leads to new agent', { agentId });
  }
}

export const agentOnboardingService = new AgentOnboardingService();