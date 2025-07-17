# RFQ Integration Technical Specification

## 🎯 Overview

**Chapter**: 6 - RFQ Integration  
**Priority**: 🔴 Critical  
**Timeline**: 3-4 weeks  
**Status**: Ready for implementation  

This document provides detailed technical specifications for integrating the Expert Marketplace with the main FoodXchange RFQ system, enabling seamless workflow from RFQ creation to expert matching and proposal submission.

---

## 📋 Business Requirements

### **Primary Objectives**
1. **Seamless Integration**: Connect RFQ system with expert marketplace
2. **Automated Matching**: Intelligent expert suggestions for RFQs
3. **Streamlined Workflow**: Reduce time from RFQ to expert engagement
4. **Enhanced User Experience**: Unified platform experience

### **Success Metrics**
- **RFQ Processing Time**: < 5 minutes from creation to expert matching
- **Matching Accuracy**: > 85% relevant expert suggestions
- **Expert Response Rate**: > 70% within 24 hours
- **Client Satisfaction**: > 4.5/5 rating

---

## 🏗️ Technical Architecture

### **System Integration Overview**
```
┌─────────────────────────────────────────────────────────────────┐
│                    RFQ Integration Architecture                 │
├─────────────────────────────────────────────────────────────────┤
│  Main FoodXchange Platform                                      │
│  ├── RFQ Creation Interface                                     │
│  ├── RFQ Management System                                      │
│  └── Client Dashboard                                           │
│                        │                                        │
│                        │ Webhooks                               │
│                        ▼                                        │
│  Expert Marketplace Service                                     │
│  ├── Webhook Processing                                         │
│  ├── Expert Matching Engine                                     │
│  ├── Proposal Management                                        │
│  └── Expert Dashboard                                           │
│                        │                                        │
│                        │ API Calls                              │
│                        ▼                                        │
│  Shared Services                                                │
│  ├── User Management                                            │
│  ├── Notification Service                                       │
│  ├── Analytics Engine                                           │
│  └── Payment Processing                                         │
└─────────────────────────────────────────────────────────────────┘
```

### **Data Flow**
1. **RFQ Creation**: Client creates RFQ in main platform
2. **Webhook Trigger**: Main platform sends webhook to expert marketplace
3. **Expert Matching**: AI engine identifies suitable experts
4. **Notification**: Experts receive RFQ notifications
5. **Proposal Submission**: Experts submit proposals
6. **Evaluation**: Client reviews and selects expert
7. **Project Initiation**: Selected expert begins work

---

## 🔧 Implementation Components

### **1. Webhook System**

#### **Webhook Endpoints**
```typescript
// RFQ Webhook Handler
interface RFQWebhookPayload {
  event: 'rfq.created' | 'rfq.updated' | 'rfq.cancelled' | 'rfq.closed';
  rfq_id: string;
  timestamp: string;
  signature: string;
  data: {
    id: string;
    title: string;
    description: string;
    category: string;
    budget: {
      min: number;
      max: number;
      currency: string;
    };
    timeline: {
      start_date: string;
      end_date: string;
      urgency: 'low' | 'medium' | 'high' | 'urgent';
    };
    requirements: string[];
    location: {
      country: string;
      city?: string;
      remote_allowed: boolean;
    };
    client: {
      id: string;
      name: string;
      company: string;
      contact_email: string;
    };
    attachments: Array<{
      filename: string;
      url: string;
      size: number;
    }>;
  };
}

// Webhook endpoint implementation
@Post('/webhooks/rfq')
@UseGuards(WebhookAuthGuard)
async handleRFQWebhook(@Body() payload: RFQWebhookPayload) {
  // Verify webhook signature
  const isValid = await this.webhookService.verifySignature(payload);
  if (!isValid) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  // Process webhook event
  switch (payload.event) {
    case 'rfq.created':
      await this.rfqService.processNewRFQ(payload.data);
      break;
    case 'rfq.updated':
      await this.rfqService.updateRFQ(payload.data);
      break;
    case 'rfq.cancelled':
      await this.rfqService.cancelRFQ(payload.rfq_id);
      break;
    case 'rfq.closed':
      await this.rfqService.closeRFQ(payload.rfq_id);
      break;
  }

  return { status: 'success', processed_at: new Date() };
}
```

#### **Webhook Security**
- **Signature Verification**: HMAC-SHA256 signature validation
- **Timestamp Validation**: Prevent replay attacks
- **IP Whitelisting**: Only accept webhooks from trusted IPs
- **Rate Limiting**: Prevent webhook spam

### **2. RFQ Data Model**

```typescript
// RFQ Schema
export interface IRFQ {
  id: string;
  external_id: string; // ID from main platform
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  
  budget: {
    min: number;
    max: number;
    currency: string;
    payment_terms: string;
  };
  
  timeline: {
    start_date: Date;
    end_date: Date;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    estimated_duration: number; // in days
  };
  
  requirements: {
    mandatory: string[];
    preferred: string[];
    certifications: string[];
    experience_level: 'junior' | 'mid' | 'senior' | 'expert';
  };
  
  location: {
    country: string;
    city?: string;
    remote_allowed: boolean;
    travel_required: boolean;
  };
  
  client: {
    id: string;
    name: string;
    company: string;
    contact_email: string;
    phone?: string;
  };
  
  attachments: Array<{
    filename: string;
    url: string;
    size: number;
    type: string;
  }>;
  
  status: 'active' | 'closed' | 'cancelled' | 'paused';
  
  matching: {
    matched_experts: string[];
    proposals_received: number;
    proposals_evaluated: number;
    selected_expert?: string;
  };
  
  analytics: {
    views: number;
    expert_interests: number;
    proposals_submitted: number;
    avg_response_time: number;
  };
  
  metadata: {
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
    source: string;
    tags: string[];
  };
}

// Mongoose Schema
const RFQSchema = new mongoose.Schema({
  external_id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  subcategory: String,
  
  budget: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    payment_terms: String
  },
  
  timeline: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    urgency: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    estimated_duration: Number
  },
  
  requirements: {
    mandatory: [String],
    preferred: [String],
    certifications: [String],
    experience_level: { type: String, enum: ['junior', 'mid', 'senior', 'expert'] }
  },
  
  status: { type: String, enum: ['active', 'closed', 'cancelled', 'paused'], default: 'active' },
  
  matching: {
    matched_experts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExpertProfile' }],
    proposals_received: { type: Number, default: 0 },
    proposals_evaluated: { type: Number, default: 0 },
    selected_expert: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpertProfile' }
  },
  
  analytics: {
    views: { type: Number, default: 0 },
    expert_interests: { type: Number, default: 0 },
    proposals_submitted: { type: Number, default: 0 },
    avg_response_time: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes for performance
RFQSchema.index({ external_id: 1 });
RFQSchema.index({ category: 1, status: 1 });
RFQSchema.index({ 'timeline.urgency': 1, 'timeline.end_date': 1 });
RFQSchema.index({ 'budget.min': 1, 'budget.max': 1 });
RFQSchema.index({ created_at: -1 });
```

### **3. Expert Matching Engine Enhancement**

```typescript
// Enhanced matching for RFQs
export class RFQMatchingEngine {
  async findMatchingExperts(rfq: IRFQ): Promise<ExpertMatch[]> {
    // 1. Category and specialization matching
    const categoryMatches = await this.findExpertsByCategory(rfq.category);
    
    // 2. Experience level matching
    const experienceMatches = this.filterByExperience(
      categoryMatches, 
      rfq.requirements.experience_level
    );
    
    // 3. Certification matching
    const certificationMatches = this.filterByCertifications(
      experienceMatches,
      rfq.requirements.certifications
    );
    
    // 4. Location and availability matching
    const locationMatches = this.filterByLocation(
      certificationMatches,
      rfq.location
    );
    
    // 5. Budget alignment
    const budgetMatches = this.filterByBudget(
      locationMatches,
      rfq.budget
    );
    
    // 6. AI-powered content matching
    const aiMatches = await this.aiMatchingEngine.analyzeRFQContent(
      rfq.description,
      rfq.requirements.mandatory,
      budgetMatches
    );
    
    // 7. Scoring and ranking
    const scoredMatches = await this.scoreAndRankExperts(rfq, aiMatches);
    
    return scoredMatches.slice(0, 10); // Return top 10 matches
  }
  
  private async scoreAndRankExperts(
    rfq: IRFQ, 
    experts: ExpertProfile[]
  ): Promise<ExpertMatch[]> {
    const matches: ExpertMatch[] = [];
    
    for (const expert of experts) {
      const score = await this.calculateMatchScore(rfq, expert);
      matches.push({
        expert_id: expert._id,
        expert,
        match_score: score.total,
        score_breakdown: score.breakdown,
        match_reasons: score.reasons,
        confidence: score.confidence
      });
    }
    
    return matches.sort((a, b) => b.match_score - a.match_score);
  }
  
  private async calculateMatchScore(
    rfq: IRFQ, 
    expert: ExpertProfile
  ): Promise<MatchScore> {
    const scores = {
      category: this.scoreCategoryMatch(rfq.category, expert.specializations),
      experience: this.scoreExperienceMatch(rfq.requirements.experience_level, expert.experience),
      certifications: this.scoreCertificationMatch(rfq.requirements.certifications, expert.certifications),
      location: this.scoreLocationMatch(rfq.location, expert.location),
      budget: this.scoreBudgetMatch(rfq.budget, expert.hourly_rate),
      availability: this.scoreAvailabilityMatch(rfq.timeline, expert.availability),
      rating: expert.rating * 20, // Convert 5-star to 100-point scale
      response_time: this.scoreResponseTime(expert.avg_response_time),
      success_rate: expert.success_rate
    };
    
    // Weighted scoring
    const weights = {
      category: 0.25,
      experience: 0.15,
      certifications: 0.15,
      location: 0.10,
      budget: 0.10,
      availability: 0.10,
      rating: 0.10,
      response_time: 0.03,
      success_rate: 0.02
    };
    
    const total = Object.keys(scores).reduce((sum, key) => {
      return sum + (scores[key] * weights[key]);
    }, 0);
    
    return {
      total,
      breakdown: scores,
      reasons: this.generateMatchReasons(rfq, expert, scores),
      confidence: this.calculateConfidence(scores)
    };
  }
}
```

### **4. Proposal Management System**

```typescript
// Proposal Schema
export interface IProposal {
  id: string;
  rfq_id: string;
  expert_id: string;
  
  proposal: {
    title: string;
    description: string;
    approach: string;
    deliverables: string[];
    timeline: {
      start_date: Date;
      end_date: Date;
      milestones: Array<{
        name: string;
        description: string;
        due_date: Date;
        amount: number;
      }>;
    };
    budget: {
      total_amount: number;
      currency: string;
      payment_terms: string;
      breakdown: Array<{
        item: string;
        amount: number;
        description: string;
      }>;
    };
  };
  
  expert_info: {
    relevant_experience: string;
    similar_projects: string[];
    certifications: string[];
    portfolio_links: string[];
  };
  
  attachments: Array<{
    filename: string;
    url: string;
    size: number;
    type: string;
  }>;
  
  status: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn';
  
  client_feedback?: {
    rating: number;
    comments: string;
    questions: Array<{
      question: string;
      answer?: string;
      answered_at?: Date;
    }>;
  };
  
  metadata: {
    submitted_at: Date;
    reviewed_at?: Date;
    response_time: number; // in hours
    auto_generated: boolean;
  };
}

// Proposal Service
export class ProposalService {
  async createProposal(
    rfqId: string, 
    expertId: string, 
    proposalData: any
  ): Promise<IProposal> {
    // Validate RFQ exists and is active
    const rfq = await this.rfqService.findById(rfqId);
    if (!rfq || rfq.status !== 'active') {
      throw new BadRequestException('RFQ not available for proposals');
    }
    
    // Check if expert already submitted proposal
    const existingProposal = await this.findByRFQAndExpert(rfqId, expertId);
    if (existingProposal) {
      throw new BadRequestException('Proposal already submitted for this RFQ');
    }
    
    // Create proposal
    const proposal = await this.proposalModel.create({
      rfq_id: rfqId,
      expert_id: expertId,
      ...proposalData,
      status: 'submitted',
      metadata: {
        submitted_at: new Date(),
        response_time: this.calculateResponseTime(rfq.created_at),
        auto_generated: false
      }
    });
    
    // Update RFQ statistics
    await this.rfqService.updateProposalStats(rfqId, {
      proposals_received: 1
    });
    
    // Send notifications
    await this.notificationService.sendProposalSubmitted(proposal);
    
    return proposal;
  }
  
  async generateAIProposal(
    rfqId: string, 
    expertId: string
  ): Promise<IProposal> {
    const rfq = await this.rfqService.findById(rfqId);
    const expert = await this.expertService.findById(expertId);
    
    // Use AI to generate proposal content
    const aiProposal = await this.aiService.generateProposal({
      rfq_description: rfq.description,
      rfq_requirements: rfq.requirements,
      expert_profile: expert,
      similar_projects: expert.portfolio
    });
    
    return this.createProposal(rfqId, expertId, {
      ...aiProposal,
      metadata: { auto_generated: true }
    });
  }
}
```

### **5. Notification System**

```typescript
// RFQ Notification Service
export class RFQNotificationService {
  async notifyExpertsOfNewRFQ(rfq: IRFQ, matchedExperts: ExpertMatch[]): Promise<void> {
    const notifications = matchedExperts.map(match => ({
      expert_id: match.expert_id,
      type: 'rfq_match',
      priority: this.calculateNotificationPriority(rfq.timeline.urgency, match.match_score),
      data: {
        rfq_id: rfq.id,
        title: rfq.title,
        match_score: match.match_score,
        budget: rfq.budget,
        timeline: rfq.timeline,
        match_reasons: match.match_reasons.slice(0, 3)
      }
    }));
    
    // Send notifications through multiple channels
    await Promise.all([
      this.emailService.sendRFQMatchNotifications(notifications),
      this.pushService.sendRFQMatchNotifications(notifications),
      this.whatsappService.sendRFQMatchNotifications(notifications.filter(n => n.priority === 'high'))
    ]);
  }
  
  async notifyClientOfProposal(proposal: IProposal): Promise<void> {
    const rfq = await this.rfqService.findById(proposal.rfq_id);
    const expert = await this.expertService.findById(proposal.expert_id);
    
    await this.emailService.sendProposalReceived({
      client_email: rfq.client.contact_email,
      rfq_title: rfq.title,
      expert_name: expert.name,
      proposal_summary: proposal.proposal.title,
      proposal_amount: proposal.proposal.budget.total_amount,
      proposal_url: this.generateProposalUrl(proposal.id)
    });
  }
}
```

### **6. Analytics and Reporting**

```typescript
// RFQ Analytics Service
export class RFQAnalyticsService {
  async generateRFQReport(rfqId: string): Promise<RFQReport> {
    const rfq = await this.rfqService.findById(rfqId);
    const proposals = await this.proposalService.findByRFQ(rfqId);
    const matchedExperts = await this.matchingService.getMatchedExperts(rfqId);
    
    return {
      rfq_summary: {
        id: rfq.id,
        title: rfq.title,
        category: rfq.category,
        budget: rfq.budget,
        timeline: rfq.timeline,
        status: rfq.status
      },
      
      matching_performance: {
        total_experts_matched: matchedExperts.length,
        avg_match_score: this.calculateAverageMatchScore(matchedExperts),
        top_match_score: Math.max(...matchedExperts.map(e => e.match_score)),
        match_distribution: this.calculateMatchDistribution(matchedExperts)
      },
      
      proposal_metrics: {
        total_proposals: proposals.length,
        response_rate: (proposals.length / matchedExperts.length) * 100,
        avg_response_time: this.calculateAverageResponseTime(proposals),
        proposal_status_distribution: this.getProposalStatusDistribution(proposals),
        avg_proposal_amount: this.calculateAverageProposalAmount(proposals)
      },
      
      timeline_analysis: {
        rfq_duration: this.calculateRFQDuration(rfq),
        time_to_first_proposal: this.calculateTimeToFirstProposal(rfq, proposals),
        proposal_submission_timeline: this.getProposalTimeline(proposals)
      },
      
      recommendations: this.generateRecommendations(rfq, matchedExperts, proposals)
    };
  }
  
  async generateSystemAnalytics(): Promise<SystemAnalytics> {
    const timeRange = { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() };
    
    return {
      rfq_volume: {
        total_rfqs: await this.rfqService.count(timeRange),
        active_rfqs: await this.rfqService.countByStatus('active'),
        completed_rfqs: await this.rfqService.countByStatus('closed'),
        cancelled_rfqs: await this.rfqService.countByStatus('cancelled')
      },
      
      matching_performance: {
        avg_experts_per_rfq: await this.calculateAvgExpertsPerRFQ(timeRange),
        avg_match_score: await this.calculateSystemAvgMatchScore(timeRange),
        matching_accuracy: await this.calculateMatchingAccuracy(timeRange)
      },
      
      proposal_metrics: {
        total_proposals: await this.proposalService.count(timeRange),
        avg_proposals_per_rfq: await this.calculateAvgProposalsPerRFQ(timeRange),
        proposal_acceptance_rate: await this.calculateAcceptanceRate(timeRange),
        avg_response_time: await this.calculateSystemAvgResponseTime(timeRange)
      },
      
      expert_engagement: {
        active_experts: await this.expertService.countActiveExperts(timeRange),
        proposal_submission_rate: await this.calculateSubmissionRate(timeRange),
        expert_success_rate: await this.calculateExpertSuccessRate(timeRange)
      }
    };
  }
}
```

---

## 🔌 **API Endpoints**

### **RFQ Management**
```
GET    /api/v1/rfqs                     - List RFQs with pagination
GET    /api/v1/rfqs/:id                 - Get RFQ details
POST   /api/v1/rfqs/:id/interest        - Express interest in RFQ
GET    /api/v1/rfqs/:id/matches         - Get matched experts
POST   /api/v1/rfqs/:id/proposals       - Submit proposal
GET    /api/v1/rfqs/:id/proposals       - List proposals for RFQ
PUT    /api/v1/rfqs/:id/proposals/:pid  - Update proposal
GET    /api/v1/rfqs/:id/analytics       - RFQ analytics
```

### **Expert Dashboard**
```
GET    /api/v1/experts/rfqs/matched     - Get matched RFQs for expert
GET    /api/v1/experts/rfqs/interested  - Get RFQs expert showed interest in
GET    /api/v1/experts/proposals        - List expert's proposals
POST   /api/v1/experts/proposals/generate - Generate AI proposal
```

### **Webhook Endpoints**
```
POST   /api/v1/webhooks/rfq             - RFQ webhook handler
POST   /api/v1/webhooks/verify          - Webhook verification
```

---

## 🔒 **Security Considerations**

### **Webhook Security**
- HMAC-SHA256 signature verification
- Timestamp validation (max 5 minutes)
- IP whitelisting for webhook sources
- Rate limiting on webhook endpoints
- Detailed logging of all webhook events

### **Data Protection**
- Encrypt sensitive RFQ data at rest
- Secure API communication with HTTPS
- Role-based access control for RFQ data
- Data retention policies for completed RFQs
- GDPR compliance for client data

### **API Security**
- JWT authentication for all endpoints
- Rate limiting on API endpoints
- Input validation and sanitization
- SQL injection prevention
- XSS protection

---

## 📊 **Performance Requirements**

### **Response Time Targets**
- **Webhook Processing**: < 1 second
- **Expert Matching**: < 5 seconds
- **Proposal Submission**: < 2 seconds
- **RFQ Listing**: < 500ms
- **Analytics Generation**: < 10 seconds

### **Scalability Targets**
- **Concurrent RFQs**: 1,000+ active RFQs
- **Expert Matching**: 10,000+ experts
- **Proposal Processing**: 100+ proposals/minute
- **Webhook Processing**: 500+ webhooks/minute

### **Database Performance**
- **RFQ Queries**: < 100ms
- **Expert Matching**: < 2 seconds
- **Proposal Queries**: < 50ms
- **Analytics Queries**: < 5 seconds

---

## 🧪 **Testing Strategy**

### **Unit Tests**
- Webhook signature verification
- Expert matching algorithm
- Proposal validation logic
- Analytics calculations
- Notification sending

### **Integration Tests**
- Webhook end-to-end processing
- Database operations
- External API calls
- Email/SMS notifications
- Payment processing

### **Load Tests**
- Concurrent webhook processing
- Expert matching performance
- Database query performance
- API endpoint throughput
- System stability under load

### **Security Tests**
- Webhook security validation
- API authentication testing
- Input validation testing
- SQL injection prevention
- XSS protection testing

---

## 🚀 **Deployment Plan**

### **Phase 1: Infrastructure Setup** (Week 1)
- [ ] Set up webhook endpoints
- [ ] Configure database schemas
- [ ] Implement security measures
- [ ] Set up monitoring and logging
- [ ] Configure CI/CD pipeline

### **Phase 2: Core Implementation** (Week 2)
- [ ] Implement webhook processing
- [ ] Build expert matching engine
- [ ] Create proposal management system
- [ ] Develop notification system
- [ ] Add basic analytics

### **Phase 3: Integration Testing** (Week 3)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security testing
- [ ] User acceptance testing
- [ ] Load testing

### **Phase 4: Production Deployment** (Week 4)
- [ ] Production deployment
- [ ] Monitoring setup
- [ ] Performance tuning
- [ ] Bug fixes and optimization
- [ ] Documentation and training

---

## 📈 **Success Metrics**

### **Technical Metrics**
- **Webhook Processing**: 100% success rate
- **Expert Matching**: < 5 seconds response time
- **System Uptime**: 99.9%
- **Error Rate**: < 0.1%
- **Database Performance**: < 100ms queries

### **Business Metrics**
- **RFQ Processing Time**: < 5 minutes
- **Expert Response Rate**: > 70%
- **Proposal Quality**: > 4.0/5 rating
- **Client Satisfaction**: > 4.5/5 rating
- **Conversion Rate**: > 25%

### **User Experience Metrics**
- **Page Load Time**: < 2 seconds
- **Expert Onboarding**: < 10 minutes
- **Proposal Submission**: < 15 minutes
- **Mobile Responsiveness**: 100%
- **Accessibility**: WCAG 2.1 AA compliance

---

**Document Version**: 1.0  
**Created**: December 2024  
**Implementation Timeline**: 3-4 weeks  
**Priority**: Critical  
**Status**: Ready for development