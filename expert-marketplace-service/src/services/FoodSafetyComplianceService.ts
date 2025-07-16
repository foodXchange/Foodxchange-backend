import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService';
import { config } from '../config';

const logger = new Logger('FoodSafetyComplianceService');

export interface ComplianceStandard {
  id: string;
  name: string;
  authority: string;
  region: string[];
  category: string[];
  version: string;
  effectiveDate: Date;
  expiryDate?: Date;
  requirements: ComplianceRequirement[];
  auditFrequency: 'annual' | 'biannual' | 'quarterly' | 'monthly';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceRequirement {
  id: string;
  section: string;
  title: string;
  description: string;
  category: 'documentation' | 'training' | 'facility' | 'process' | 'testing' | 'monitoring';
  mandatory: boolean;
  evidenceTypes: string[];
  validityPeriod?: number; // months
  dependencies?: string[];
}

export interface ComplianceEvidence {
  id: string;
  requirementId: string;
  type: 'certificate' | 'document' | 'photo' | 'video' | 'test_result' | 'audit_report';
  name: string;
  description: string;
  fileUrl: string;
  uploadedAt: Date;
  validFrom: Date;
  validUntil?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  verifiedBy?: string;
  verifiedAt?: Date;
  metadata: Record<string, any>;
}

export interface ComplianceProfile {
  entityId: string;
  entityType: 'expert' | 'supplier' | 'facility';
  region: string;
  industryCategory: string[];
  applicableStandards: string[];
  evidenceSubmitted: ComplianceEvidence[];
  complianceScore: number;
  lastAuditDate?: Date;
  nextAuditDue?: Date;
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    lastUpdated: Date;
  };
  certifications: {
    standardId: string;
    certificateNumber: string;
    issuedBy: string;
    issuedDate: Date;
    expiryDate: Date;
    status: 'active' | 'expired' | 'suspended' | 'revoked';
  }[];
}

export interface ComplianceAudit {
  id: string;
  profileId: string;
  auditorId: string;
  standardIds: string[];
  auditType: 'initial' | 'surveillance' | 'renewal' | 'unannounced';
  scheduledDate: Date;
  completedDate?: Date;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  findings: AuditFinding[];
  overallScore: number;
  recommendations: string[];
  nextAuditDate?: Date;
}

export interface AuditFinding {
  id: string;
  requirementId: string;
  severity: 'minor' | 'major' | 'critical';
  description: string;
  evidence: string;
  correctionRequired: boolean;
  correctiveAction?: string;
  targetDate?: Date;
  status: 'open' | 'in_progress' | 'closed' | 'verified';
}

export class FoodSafetyComplianceService {
  private complianceStandards: Map<string, ComplianceStandard> = new Map();
  private complianceProfiles: Map<string, ComplianceProfile> = new Map();

  constructor() {
    this.loadComplianceStandards();
  }

  private loadComplianceStandards(): void {
    const standards: ComplianceStandard[] = [
      // HACCP Standard
      {
        id: 'haccp_2023',
        name: 'Hazard Analysis Critical Control Points (HACCP)',
        authority: 'Codex Alimentarius Commission',
        region: ['global'],
        category: ['food_processing', 'manufacturing', 'packaging'],
        version: '2023.1',
        effectiveDate: new Date('2023-01-01'),
        auditFrequency: 'annual',
        riskLevel: 'high',
        requirements: [
          {
            id: 'haccp_req_1',
            section: '1.0',
            title: 'Hazard Analysis',
            description: 'Conduct a thorough hazard analysis identifying biological, chemical, and physical hazards',
            category: 'documentation',
            mandatory: true,
            evidenceTypes: ['document', 'audit_report'],
            validityPeriod: 12
          },
          {
            id: 'haccp_req_2',
            section: '2.0',
            title: 'Critical Control Points',
            description: 'Identify critical control points in the production process',
            category: 'process',
            mandatory: true,
            evidenceTypes: ['document', 'photo'],
            validityPeriod: 12
          },
          {
            id: 'haccp_req_3',
            section: '3.0',
            title: 'Critical Limits',
            description: 'Establish critical limits for each CCP',
            category: 'documentation',
            mandatory: true,
            evidenceTypes: ['document'],
            validityPeriod: 12
          },
          {
            id: 'haccp_req_4',
            section: '4.0',
            title: 'Monitoring System',
            description: 'Establish monitoring system for CCPs',
            category: 'monitoring',
            mandatory: true,
            evidenceTypes: ['document', 'test_result'],
            validityPeriod: 6
          }
        ]
      },

      // FDA FSMA
      {
        id: 'fda_fsma_2024',
        name: 'FDA Food Safety Modernization Act (FSMA)',
        authority: 'US Food and Drug Administration',
        region: ['usa'],
        category: ['food_processing', 'manufacturing', 'distribution'],
        version: '2024.2',
        effectiveDate: new Date('2024-01-01'),
        auditFrequency: 'biannual',
        riskLevel: 'critical',
        requirements: [
          {
            id: 'fsma_req_1',
            section: 'PC-117',
            title: 'Preventive Controls for Human Food',
            description: 'Implement preventive controls to minimize food safety hazards',
            category: 'process',
            mandatory: true,
            evidenceTypes: ['document', 'audit_report'],
            validityPeriod: 12
          },
          {
            id: 'fsma_req_2',
            section: 'PC-117.135',
            title: 'Supplier Verification',
            description: 'Establish supplier verification programs',
            category: 'documentation',
            mandatory: true,
            evidenceTypes: ['document', 'certificate'],
            validityPeriod: 12
          }
        ]
      },

      // BRC Global Standard
      {
        id: 'brc_food_v9',
        name: 'BRC Global Standard for Food Safety',
        authority: 'BRC Trading Ltd',
        region: ['global'],
        category: ['food_processing', 'manufacturing', 'packaging'],
        version: 'Issue 9',
        effectiveDate: new Date('2023-08-01'),
        auditFrequency: 'annual',
        riskLevel: 'high',
        requirements: [
          {
            id: 'brc_req_1',
            section: '1.0',
            title: 'Senior Management Commitment',
            description: 'Demonstrate senior management commitment to food safety',
            category: 'documentation',
            mandatory: true,
            evidenceTypes: ['document'],
            validityPeriod: 12
          },
          {
            id: 'brc_req_2',
            section: '2.0',
            title: 'Food Safety Plan - HACCP',
            description: 'Implement effective HACCP-based food safety management system',
            category: 'process',
            mandatory: true,
            evidenceTypes: ['document', 'audit_report'],
            validityPeriod: 12
          }
        ]
      },

      // SQF Standard
      {
        id: 'sqf_9th_edition',
        name: 'Safe Quality Food (SQF) Code',
        authority: 'SQF Institute',
        region: ['global'],
        category: ['food_processing', 'manufacturing', 'primary_production'],
        version: '9th Edition',
        effectiveDate: new Date('2023-01-01'),
        auditFrequency: 'annual',
        riskLevel: 'high',
        requirements: [
          {
            id: 'sqf_req_1',
            section: '2.1',
            title: 'Food Safety Management System',
            description: 'Establish, implement and maintain a food safety management system',
            category: 'process',
            mandatory: true,
            evidenceTypes: ['document', 'audit_report'],
            validityPeriod: 12
          }
        ]
      }
    ];

    standards.forEach(standard => {
      this.complianceStandards.set(standard.id, standard);
    });

    logger.info(`Loaded ${standards.length} compliance standards`);
  }

  /**
   * Get applicable compliance standards for entity
   */
  async getApplicableStandards(
    region: string,
    industryCategory: string[],
    entityType: 'expert' | 'supplier' | 'facility'
  ): Promise<ComplianceStandard[]> {
    try {
      const cacheKey = `applicable_standards:${region}:${industryCategory.join(',')}:${entityType}`;
      const cached = await advancedCacheService.get<ComplianceStandard[]>(cacheKey);
      
      if (cached) return cached;

      const applicableStandards = Array.from(this.complianceStandards.values()).filter(standard => {
        // Check region applicability
        const regionMatch = standard.region.includes('global') || standard.region.includes(region.toLowerCase());
        
        // Check category applicability
        const categoryMatch = industryCategory.some(category => 
          standard.category.includes(category.toLowerCase())
        );

        return regionMatch && categoryMatch;
      });

      // Cache for 24 hours
      await advancedCacheService.set(cacheKey, applicableStandards, {
        ttl: 86400,
        tags: ['compliance_standards', region, ...industryCategory]
      });

      return applicableStandards;
    } catch (error) {
      logger.error('Error getting applicable standards:', error);
      return [];
    }
  }

  /**
   * Create compliance profile for entity
   */
  async createComplianceProfile(
    entityId: string,
    entityType: 'expert' | 'supplier' | 'facility',
    region: string,
    industryCategory: string[]
  ): Promise<ComplianceProfile> {
    try {
      const applicableStandards = await this.getApplicableStandards(region, industryCategory, entityType);
      
      const profile: ComplianceProfile = {
        entityId,
        entityType,
        region,
        industryCategory,
        applicableStandards: applicableStandards.map(s => s.id),
        evidenceSubmitted: [],
        complianceScore: 0,
        riskAssessment: {
          level: 'medium',
          factors: ['No compliance evidence submitted'],
          lastUpdated: new Date()
        },
        certifications: []
      };

      this.complianceProfiles.set(entityId, profile);

      // Store in database
      // await ComplianceProfile.create(profile);

      // Cache the profile
      await advancedCacheService.set(`compliance_profile:${entityId}`, profile, {
        ttl: 3600,
        tags: ['compliance_profiles', `entity:${entityId}`]
      });

      logger.info('Compliance profile created', { entityId, entityType });
      return profile;
    } catch (error) {
      logger.error('Error creating compliance profile:', error);
      throw error;
    }
  }

  /**
   * Submit compliance evidence
   */
  async submitEvidence(
    entityId: string,
    evidence: Omit<ComplianceEvidence, 'id' | 'uploadedAt' | 'status'>
  ): Promise<ComplianceEvidence> {
    try {
      const profile = await this.getComplianceProfile(entityId);
      if (!profile) {
        throw new Error('Compliance profile not found');
      }

      const newEvidence: ComplianceEvidence = {
        ...evidence,
        id: `evidence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        uploadedAt: new Date(),
        status: 'pending'
      };

      profile.evidenceSubmitted.push(newEvidence);

      // Update compliance score
      profile.complianceScore = await this.calculateComplianceScore(profile);

      // Update risk assessment
      profile.riskAssessment = await this.assessRisk(profile);

      // Update profile
      await this.updateComplianceProfile(profile);

      logger.info('Compliance evidence submitted', { 
        entityId, 
        evidenceId: newEvidence.id,
        requirementId: evidence.requirementId 
      });

      return newEvidence;
    } catch (error) {
      logger.error('Error submitting evidence:', error);
      throw error;
    }
  }

  /**
   * Verify compliance evidence
   */
  async verifyEvidence(
    evidenceId: string,
    verifierId: string,
    status: 'approved' | 'rejected',
    notes?: string
  ): Promise<void> {
    try {
      // Find profile containing this evidence
      let targetProfile: ComplianceProfile | null = null;
      let evidenceIndex = -1;

      for (const profile of this.complianceProfiles.values()) {
        const index = profile.evidenceSubmitted.findIndex(e => e.id === evidenceId);
        if (index !== -1) {
          targetProfile = profile;
          evidenceIndex = index;
          break;
        }
      }

      if (!targetProfile || evidenceIndex === -1) {
        throw new Error('Evidence not found');
      }

      // Update evidence
      targetProfile.evidenceSubmitted[evidenceIndex].status = status;
      targetProfile.evidenceSubmitted[evidenceIndex].verifiedBy = verifierId;
      targetProfile.evidenceSubmitted[evidenceIndex].verifiedAt = new Date();

      if (notes) {
        targetProfile.evidenceSubmitted[evidenceIndex].metadata.verificationNotes = notes;
      }

      // Recalculate compliance score
      targetProfile.complianceScore = await this.calculateComplianceScore(targetProfile);

      // Update risk assessment
      targetProfile.riskAssessment = await this.assessRisk(targetProfile);

      // Update profile
      await this.updateComplianceProfile(targetProfile);

      logger.info('Evidence verification completed', { 
        evidenceId, 
        status, 
        verifierId,
        entityId: targetProfile.entityId 
      });
    } catch (error) {
      logger.error('Error verifying evidence:', error);
      throw error;
    }
  }

  /**
   * Get compliance profile
   */
  async getComplianceProfile(entityId: string): Promise<ComplianceProfile | null> {
    try {
      // Try cache first
      const cached = await advancedCacheService.get<ComplianceProfile>(`compliance_profile:${entityId}`);
      if (cached) return cached;

      // Try in-memory
      const profile = this.complianceProfiles.get(entityId);
      if (profile) {
        // Cache it
        await advancedCacheService.set(`compliance_profile:${entityId}`, profile, {
          ttl: 3600,
          tags: ['compliance_profiles', `entity:${entityId}`]
        });
        return profile;
      }

      // Try database
      // const profile = await ComplianceProfile.findOne({ entityId });
      // if (profile) {
      //   this.complianceProfiles.set(entityId, profile);
      //   await advancedCacheService.set(`compliance_profile:${entityId}`, profile, {
      //     ttl: 3600,
      //     tags: ['compliance_profiles', `entity:${entityId}`]
      //   });
      //   return profile;
      // }

      return null;
    } catch (error) {
      logger.error('Error getting compliance profile:', error);
      return null;
    }
  }

  private async updateComplianceProfile(profile: ComplianceProfile): Promise<void> {
    try {
      // Update in-memory
      this.complianceProfiles.set(profile.entityId, profile);

      // Update database
      // await ComplianceProfile.findOneAndUpdate(
      //   { entityId: profile.entityId },
      //   profile,
      //   { upsert: true }
      // );

      // Update cache
      await advancedCacheService.set(`compliance_profile:${profile.entityId}`, profile, {
        ttl: 3600,
        tags: ['compliance_profiles', `entity:${profile.entityId}`]
      });
    } catch (error) {
      logger.error('Error updating compliance profile:', error);
      throw error;
    }
  }

  /**
   * Calculate compliance score
   */
  private async calculateComplianceScore(profile: ComplianceProfile): Promise<number> {
    try {
      let totalScore = 0;
      let totalWeightedRequirements = 0;

      for (const standardId of profile.applicableStandards) {
        const standard = this.complianceStandards.get(standardId);
        if (!standard) continue;

        let standardScore = 0;
        let standardWeight = 0;

        for (const requirement of standard.requirements) {
          const weight = requirement.mandatory ? 2 : 1;
          const riskMultiplier = standard.riskLevel === 'critical' ? 2 : 
                               standard.riskLevel === 'high' ? 1.5 : 1;
          
          const totalWeight = weight * riskMultiplier;
          standardWeight += totalWeight;

          // Check if evidence exists for this requirement
          const evidenceForRequirement = profile.evidenceSubmitted.filter(
            e => e.requirementId === requirement.id && e.status === 'approved'
          );

          if (evidenceForRequirement.length > 0) {
            // Check if evidence is still valid
            const validEvidence = evidenceForRequirement.filter(evidence => {
              if (!evidence.validUntil) return true;
              return new Date() <= evidence.validUntil;
            });

            if (validEvidence.length > 0) {
              standardScore += totalWeight;
            } else {
              // Evidence expired, partial credit
              standardScore += totalWeight * 0.3;
            }
          }
        }

        totalScore += standardScore;
        totalWeightedRequirements += standardWeight;
      }

      const complianceScore = totalWeightedRequirements > 0 ? 
        (totalScore / totalWeightedRequirements) * 100 : 0;

      return Math.round(complianceScore * 100) / 100;
    } catch (error) {
      logger.error('Error calculating compliance score:', error);
      return 0;
    }
  }

  /**
   * Assess risk level
   */
  private async assessRisk(profile: ComplianceProfile): Promise<ComplianceProfile['riskAssessment']> {
    const factors: string[] = [];
    let riskScore = 0;

    // Compliance score factor
    if (profile.complianceScore < 60) {
      factors.push('Low overall compliance score');
      riskScore += 3;
    } else if (profile.complianceScore < 80) {
      factors.push('Moderate compliance gaps identified');
      riskScore += 2;
    } else if (profile.complianceScore < 95) {
      factors.push('Minor compliance gaps');
      riskScore += 1;
    }

    // Missing critical requirements
    const criticalStandards = profile.applicableStandards.filter(standardId => {
      const standard = this.complianceStandards.get(standardId);
      return standard?.riskLevel === 'critical';
    });

    const criticalRequirementsMet = criticalStandards.every(standardId => {
      const standard = this.complianceStandards.get(standardId);
      if (!standard) return false;

      return standard.requirements.every(requirement => {
        if (!requirement.mandatory) return true;
        
        const evidence = profile.evidenceSubmitted.find(
          e => e.requirementId === requirement.id && e.status === 'approved'
        );
        
        if (!evidence) return false;
        if (!evidence.validUntil) return true;
        return new Date() <= evidence.validUntil;
      });
    });

    if (!criticalRequirementsMet) {
      factors.push('Critical compliance requirements not met');
      riskScore += 4;
    }

    // Expired evidence
    const expiredEvidence = profile.evidenceSubmitted.filter(evidence => {
      return evidence.validUntil && new Date() > evidence.validUntil;
    });

    if (expiredEvidence.length > 0) {
      factors.push(`${expiredEvidence.length} expired compliance documents`);
      riskScore += Math.min(expiredEvidence.length, 3);
    }

    // Last audit date
    if (profile.lastAuditDate) {
      const daysSinceAudit = Math.floor(
        (Date.now() - profile.lastAuditDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceAudit > 730) { // 2 years
        factors.push('No recent compliance audit');
        riskScore += 2;
      } else if (daysSinceAudit > 365) { // 1 year
        factors.push('Audit overdue');
        riskScore += 1;
      }
    } else {
      factors.push('No compliance audit history');
      riskScore += 2;
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 8) {
      level = 'critical';
    } else if (riskScore >= 5) {
      level = 'high';
    } else if (riskScore >= 2) {
      level = 'medium';
    } else {
      level = 'low';
    }

    if (factors.length === 0) {
      factors.push('All compliance requirements met');
    }

    return {
      level,
      factors,
      lastUpdated: new Date()
    };
  }

  /**
   * Schedule compliance audit
   */
  async scheduleAudit(
    profileId: string,
    auditorId: string,
    standardIds: string[],
    auditType: 'initial' | 'surveillance' | 'renewal' | 'unannounced',
    scheduledDate: Date
  ): Promise<ComplianceAudit> {
    try {
      const audit: ComplianceAudit = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        profileId,
        auditorId,
        standardIds,
        auditType,
        scheduledDate,
        status: 'scheduled',
        findings: [],
        overallScore: 0,
        recommendations: []
      };

      // Store audit
      // await ComplianceAudit.create(audit);

      // Cache audit
      await advancedCacheService.set(`compliance_audit:${audit.id}`, audit, {
        ttl: 86400 * 30, // 30 days
        tags: ['compliance_audits', `profile:${profileId}`]
      });

      logger.info('Compliance audit scheduled', { 
        auditId: audit.id, 
        profileId, 
        scheduledDate 
      });

      return audit;
    } catch (error) {
      logger.error('Error scheduling audit:', error);
      throw error;
    }
  }

  /**
   * Get compliance requirements for standard
   */
  getStandardRequirements(standardId: string): ComplianceRequirement[] {
    const standard = this.complianceStandards.get(standardId);
    return standard ? standard.requirements : [];
  }

  /**
   * Get compliance gaps analysis
   */
  async getComplianceGaps(entityId: string): Promise<{
    totalRequirements: number;
    metRequirements: number;
    gaps: {
      standardId: string;
      standardName: string;
      missingRequirements: ComplianceRequirement[];
      expiredEvidence: ComplianceEvidence[];
    }[];
  }> {
    try {
      const profile = await this.getComplianceProfile(entityId);
      if (!profile) {
        throw new Error('Compliance profile not found');
      }

      const gaps: any[] = [];
      let totalRequirements = 0;
      let metRequirements = 0;

      for (const standardId of profile.applicableStandards) {
        const standard = this.complianceStandards.get(standardId);
        if (!standard) continue;

        const missingRequirements: ComplianceRequirement[] = [];
        const expiredEvidence: ComplianceEvidence[] = [];

        for (const requirement of standard.requirements) {
          totalRequirements++;

          const evidenceForRequirement = profile.evidenceSubmitted.filter(
            e => e.requirementId === requirement.id
          );

          const validEvidence = evidenceForRequirement.filter(evidence => {
            if (evidence.status !== 'approved') return false;
            if (!evidence.validUntil) return true;
            return new Date() <= evidence.validUntil;
          });

          if (validEvidence.length === 0) {
            missingRequirements.push(requirement);

            // Check for expired evidence
            const expired = evidenceForRequirement.filter(evidence => {
              return evidence.validUntil && new Date() > evidence.validUntil;
            });
            expiredEvidence.push(...expired);
          } else {
            metRequirements++;
          }
        }

        if (missingRequirements.length > 0 || expiredEvidence.length > 0) {
          gaps.push({
            standardId,
            standardName: standard.name,
            missingRequirements,
            expiredEvidence
          });
        }
      }

      return {
        totalRequirements,
        metRequirements,
        gaps
      };
    } catch (error) {
      logger.error('Error getting compliance gaps:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(entityId: string): Promise<{
    profile: ComplianceProfile;
    standards: ComplianceStandard[];
    gaps: any;
    recommendations: string[];
    nextActions: { action: string; priority: 'high' | 'medium' | 'low'; dueDate?: Date }[];
  }> {
    try {
      const profile = await this.getComplianceProfile(entityId);
      if (!profile) {
        throw new Error('Compliance profile not found');
      }

      const standards = profile.applicableStandards
        .map(id => this.complianceStandards.get(id))
        .filter(Boolean) as ComplianceStandard[];

      const gaps = await this.getComplianceGaps(entityId);

      const recommendations: string[] = [];
      const nextActions: any[] = [];

      // Generate recommendations based on risk level
      switch (profile.riskAssessment.level) {
        case 'critical':
          recommendations.push('Immediate action required to address critical compliance gaps');
          recommendations.push('Consider engaging compliance consultant');
          recommendations.push('Suspend operations until critical issues resolved');
          break;
        case 'high':
          recommendations.push('Address high-priority compliance gaps within 30 days');
          recommendations.push('Schedule internal audit');
          recommendations.push('Implement additional monitoring procedures');
          break;
        case 'medium':
          recommendations.push('Develop action plan to address compliance gaps');
          recommendations.push('Schedule compliance training for staff');
          break;
        case 'low':
          recommendations.push('Maintain current compliance level');
          recommendations.push('Continue regular monitoring and review');
          break;
      }

      // Generate next actions from gaps
      for (const gap of gaps.gaps) {
        for (const requirement of gap.missingRequirements) {
          const priority = requirement.mandatory ? 'high' : 'medium';
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (priority === 'high' ? 30 : 60));

          nextActions.push({
            action: `Submit evidence for: ${requirement.title}`,
            priority,
            dueDate
          });
        }

        for (const expired of gap.expiredEvidence) {
          nextActions.push({
            action: `Renew expired evidence: ${expired.name}`,
            priority: 'high',
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
          });
        }
      }

      return {
        profile,
        standards,
        gaps,
        recommendations,
        nextActions
      };
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw error;
    }
  }

  /**
   * Get all compliance standards
   */
  getAllStandards(): ComplianceStandard[] {
    return Array.from(this.complianceStandards.values());
  }

  /**
   * Search compliance standards
   */
  searchStandards(query: string, region?: string, category?: string): ComplianceStandard[] {
    const standards = Array.from(this.complianceStandards.values());
    
    return standards.filter(standard => {
      const matchesQuery = !query || 
        standard.name.toLowerCase().includes(query.toLowerCase()) ||
        standard.authority.toLowerCase().includes(query.toLowerCase());
      
      const matchesRegion = !region || 
        standard.region.includes('global') || 
        standard.region.includes(region.toLowerCase());
      
      const matchesCategory = !category || 
        standard.category.includes(category.toLowerCase());

      return matchesQuery && matchesRegion && matchesCategory;
    });
  }
}

export const foodSafetyComplianceService = new FoodSafetyComplianceService();