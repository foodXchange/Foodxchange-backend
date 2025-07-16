export interface Specialization {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  requiredCertifications?: string[];
  relatedSkills: string[];
  typicalProjects: string[];
  averageHourlyRate: { min: number; max: number };
}

export const FOOD_EXPERT_CATEGORIES = {
  COMPLIANCE_REGULATORY: 'Compliance & Regulatory',
  QUALITY_SAFETY: 'Quality & Safety',
  SUPPLY_CHAIN: 'Supply Chain & Logistics',
  PRODUCT_DEVELOPMENT: 'Product Development',
  SUSTAINABILITY: 'Sustainability & ESG',
  TECHNOLOGY: 'Food Technology & Innovation',
  BUSINESS_STRATEGY: 'Business Strategy & Operations',
  MARKETING_BRANDING: 'Marketing & Branding'
} as const;

export const EXPERT_SPECIALIZATIONS: Specialization[] = [
  // Compliance & Regulatory
  {
    id: 'haccp_specialist',
    name: 'HACCP Specialist',
    description: 'Expert in Hazard Analysis and Critical Control Points implementation and maintenance',
    category: FOOD_EXPERT_CATEGORIES.COMPLIANCE_REGULATORY,
    subcategories: ['HACCP Plan Development', 'HACCP Auditing', 'HACCP Training'],
    requiredCertifications: ['HACCP Certification', 'Food Safety Certification'],
    relatedSkills: ['Risk Assessment', 'Process Flow Analysis', 'Critical Control Points'],
    typicalProjects: ['HACCP Plan Creation', 'HACCP Audit Preparation', 'Staff Training Programs'],
    averageHourlyRate: { min: 150, max: 350 }
  },
  {
    id: 'fda_compliance',
    name: 'FDA Compliance Consultant',
    description: 'Specialist in FDA regulations, FSMA compliance, and regulatory submissions',
    category: FOOD_EXPERT_CATEGORIES.COMPLIANCE_REGULATORY,
    subcategories: ['FSMA Compliance', 'FDA Inspections', 'Label Compliance', 'Import/Export'],
    requiredCertifications: ['PCQI Certification', 'FSPCA Training'],
    relatedSkills: ['Regulatory Writing', 'Food Defense', 'Recall Planning'],
    typicalProjects: ['FDA Inspection Preparation', 'HARPC Plan Development', 'Label Review'],
    averageHourlyRate: { min: 200, max: 500 }
  },
  {
    id: 'organic_certification',
    name: 'Organic Certification Specialist',
    description: 'Expert in organic certification processes, standards, and compliance',
    category: FOOD_EXPERT_CATEGORIES.COMPLIANCE_REGULATORY,
    subcategories: ['USDA Organic', 'EU Organic', 'JAS Organic', 'Certification Prep'],
    requiredCertifications: ['Organic Inspector Certification'],
    relatedSkills: ['Organic Standards', 'Supply Chain Verification', 'Documentation'],
    typicalProjects: ['Organic Certification Application', 'Supply Chain Audit', 'Organic System Plan'],
    averageHourlyRate: { min: 125, max: 300 }
  },
  {
    id: 'halal_kosher',
    name: 'Halal/Kosher Certification Expert',
    description: 'Specialist in religious dietary law compliance and certification',
    category: FOOD_EXPERT_CATEGORIES.COMPLIANCE_REGULATORY,
    subcategories: ['Halal Certification', 'Kosher Certification', 'Ingredient Verification'],
    requiredCertifications: ['Halal Auditor Certification', 'Kosher Supervision Training'],
    relatedSkills: ['Religious Dietary Laws', 'Ingredient Analysis', 'Production Supervision'],
    typicalProjects: ['Certification Application', 'Facility Preparation', 'Ingredient Sourcing'],
    averageHourlyRate: { min: 150, max: 350 }
  },

  // Quality & Safety
  {
    id: 'food_microbiologist',
    name: 'Food Microbiologist',
    description: 'Expert in food microbiology, pathogen control, and laboratory testing',
    category: FOOD_EXPERT_CATEGORIES.QUALITY_SAFETY,
    subcategories: ['Pathogen Testing', 'Shelf Life Studies', 'Environmental Monitoring'],
    requiredCertifications: ['Certified Food Scientist', 'Laboratory Accreditation'],
    relatedSkills: ['Microbial Testing', 'Risk Assessment', 'Laboratory Management'],
    typicalProjects: ['Shelf Life Determination', 'Pathogen Risk Assessment', 'Lab Setup'],
    averageHourlyRate: { min: 175, max: 400 }
  },
  {
    id: 'quality_assurance',
    name: 'Quality Assurance Manager',
    description: 'QA system development, implementation, and continuous improvement expert',
    category: FOOD_EXPERT_CATEGORIES.QUALITY_SAFETY,
    subcategories: ['QMS Development', 'SOP Creation', 'Quality Auditing', 'GFSI Schemes'],
    requiredCertifications: ['ASQ Certification', 'Lead Auditor'],
    relatedSkills: ['ISO Standards', 'Statistical Process Control', 'Root Cause Analysis'],
    typicalProjects: ['QMS Implementation', 'Third-Party Audit Prep', 'Supplier Quality Programs'],
    averageHourlyRate: { min: 125, max: 300 }
  },
  {
    id: 'allergen_management',
    name: 'Allergen Management Specialist',
    description: 'Expert in allergen control, labeling, and cross-contamination prevention',
    category: FOOD_EXPERT_CATEGORIES.QUALITY_SAFETY,
    subcategories: ['Allergen Risk Assessment', 'Label Validation', 'Training Programs'],
    requiredCertifications: ['Allergen Management Certification'],
    relatedSkills: ['Risk Assessment', 'Analytical Testing', 'Cleaning Validation'],
    typicalProjects: ['Allergen Control Plan', 'Label Review', 'Facility Assessment'],
    averageHourlyRate: { min: 150, max: 325 }
  },

  // Supply Chain & Logistics
  {
    id: 'cold_chain_specialist',
    name: 'Cold Chain Logistics Expert',
    description: 'Specialist in temperature-controlled supply chain management',
    category: FOOD_EXPERT_CATEGORIES.SUPPLY_CHAIN,
    subcategories: ['Temperature Mapping', 'Cold Storage Design', 'Transportation'],
    requiredCertifications: ['Cold Chain Professional Certification'],
    relatedSkills: ['Temperature Monitoring', 'Risk Management', 'Logistics Planning'],
    typicalProjects: ['Cold Chain Validation', 'Distribution Network Design', 'Technology Implementation'],
    averageHourlyRate: { min: 150, max: 350 }
  },
  {
    id: 'import_export',
    name: 'Import/Export Specialist',
    description: 'International trade compliance and documentation expert',
    category: FOOD_EXPERT_CATEGORIES.SUPPLY_CHAIN,
    subcategories: ['Customs Compliance', 'Documentation', 'Trade Agreements'],
    requiredCertifications: ['Customs Broker License', 'International Trade Certification'],
    relatedSkills: ['Customs Regulations', 'HS Codes', 'Phytosanitary Requirements'],
    typicalProjects: ['Import Program Setup', 'Export Documentation', 'Compliance Audit'],
    averageHourlyRate: { min: 125, max: 275 }
  },
  {
    id: 'supply_chain_optimization',
    name: 'Supply Chain Optimization Consultant',
    description: 'Expert in supply chain efficiency, cost reduction, and risk management',
    category: FOOD_EXPERT_CATEGORIES.SUPPLY_CHAIN,
    subcategories: ['Network Design', 'Inventory Management', 'Supplier Management'],
    requiredCertifications: ['APICS Certification', 'Six Sigma'],
    relatedSkills: ['Data Analytics', 'Process Improvement', 'ERP Systems'],
    typicalProjects: ['Network Optimization', 'Cost Reduction Programs', 'Risk Assessment'],
    averageHourlyRate: { min: 175, max: 400 }
  },

  // Product Development
  {
    id: 'food_scientist',
    name: 'Food Scientist/R&D Specialist',
    description: 'Product formulation, ingredient functionality, and innovation expert',
    category: FOOD_EXPERT_CATEGORIES.PRODUCT_DEVELOPMENT,
    subcategories: ['Product Formulation', 'Ingredient Selection', 'Scale-Up'],
    requiredCertifications: ['Certified Food Scientist', 'IFT Membership'],
    relatedSkills: ['Formulation', 'Sensory Science', 'Analytical Chemistry'],
    typicalProjects: ['New Product Development', 'Reformulation', 'Cost Optimization'],
    averageHourlyRate: { min: 150, max: 400 }
  },
  {
    id: 'nutritionist',
    name: 'Food Nutritionist',
    description: 'Nutritional analysis, labeling, and health claims expert',
    category: FOOD_EXPERT_CATEGORIES.PRODUCT_DEVELOPMENT,
    subcategories: ['Nutritional Analysis', 'Label Creation', 'Health Claims'],
    requiredCertifications: ['Registered Dietitian', 'Nutrition Science Degree'],
    relatedSkills: ['Nutrition Labeling', 'Database Analysis', 'Regulatory Compliance'],
    typicalProjects: ['Nutrition Facts Panel', 'Health Claim Substantiation', 'Menu Analysis'],
    averageHourlyRate: { min: 100, max: 250 }
  },
  {
    id: 'sensory_evaluation',
    name: 'Sensory Evaluation Expert',
    description: 'Sensory testing, consumer research, and product optimization specialist',
    category: FOOD_EXPERT_CATEGORIES.PRODUCT_DEVELOPMENT,
    subcategories: ['Sensory Panel Management', 'Consumer Testing', 'Statistical Analysis'],
    requiredCertifications: ['Sensory Science Certification'],
    relatedSkills: ['Panel Training', 'Statistical Analysis', 'Consumer Research'],
    typicalProjects: ['Sensory Program Development', 'Product Testing', 'Competitive Analysis'],
    averageHourlyRate: { min: 125, max: 300 }
  },
  {
    id: 'packaging_specialist',
    name: 'Food Packaging Specialist',
    description: 'Packaging design, materials selection, and shelf life expert',
    category: FOOD_EXPERT_CATEGORIES.PRODUCT_DEVELOPMENT,
    subcategories: ['Package Design', 'Material Selection', 'Sustainability'],
    requiredCertifications: ['Packaging Professional Certification'],
    relatedSkills: ['Material Science', 'Barrier Properties', 'Migration Testing'],
    typicalProjects: ['Package Development', 'Shelf Life Extension', 'Sustainable Packaging'],
    averageHourlyRate: { min: 125, max: 325 }
  },

  // Sustainability & ESG
  {
    id: 'sustainability_consultant',
    name: 'Sustainability Consultant',
    description: 'Environmental impact, carbon footprint, and circular economy expert',
    category: FOOD_EXPERT_CATEGORIES.SUSTAINABILITY,
    subcategories: ['Carbon Footprint', 'Waste Reduction', 'Sustainable Sourcing'],
    requiredCertifications: ['Sustainability Professional Certification'],
    relatedSkills: ['LCA Analysis', 'Carbon Accounting', 'Circular Economy'],
    typicalProjects: ['Sustainability Strategy', 'Carbon Footprint Assessment', 'Waste Audit'],
    averageHourlyRate: { min: 150, max: 400 }
  },
  {
    id: 'water_management',
    name: 'Water Management Specialist',
    description: 'Water conservation, treatment, and compliance expert',
    category: FOOD_EXPERT_CATEGORIES.SUSTAINABILITY,
    subcategories: ['Water Conservation', 'Wastewater Treatment', 'Water Risk Assessment'],
    requiredCertifications: ['Water Quality Certification'],
    relatedSkills: ['Water Auditing', 'Treatment Systems', 'Regulatory Compliance'],
    typicalProjects: ['Water Reduction Programs', 'Treatment System Design', 'Compliance Planning'],
    averageHourlyRate: { min: 125, max: 300 }
  },

  // Technology & Innovation
  {
    id: 'food_tech_specialist',
    name: 'Food Technology Specialist',
    description: 'Emerging technologies, automation, and digital transformation expert',
    category: FOOD_EXPERT_CATEGORIES.TECHNOLOGY,
    subcategories: ['Process Automation', 'IoT Implementation', 'Data Analytics'],
    requiredCertifications: ['Food Technology Certification'],
    relatedSkills: ['Automation', 'Data Analysis', 'Process Engineering'],
    typicalProjects: ['Technology Assessment', 'Automation Planning', 'Digital Transformation'],
    averageHourlyRate: { min: 175, max: 450 }
  },
  {
    id: 'blockchain_traceability',
    name: 'Blockchain & Traceability Expert',
    description: 'Supply chain transparency and blockchain implementation specialist',
    category: FOOD_EXPERT_CATEGORIES.TECHNOLOGY,
    subcategories: ['Blockchain Implementation', 'Track & Trace', 'Data Integration'],
    requiredCertifications: ['Blockchain Certification'],
    relatedSkills: ['Distributed Ledger', 'API Integration', 'Data Standards'],
    typicalProjects: ['Traceability System Design', 'Blockchain Pilot', 'Integration Planning'],
    averageHourlyRate: { min: 200, max: 500 }
  },

  // Business Strategy & Operations
  {
    id: 'food_business_consultant',
    name: 'Food Business Consultant',
    description: 'Business strategy, operations improvement, and growth planning expert',
    category: FOOD_EXPERT_CATEGORIES.BUSINESS_STRATEGY,
    subcategories: ['Strategic Planning', 'Operations Improvement', 'M&A Advisory'],
    requiredCertifications: ['MBA', 'Management Consulting Certification'],
    relatedSkills: ['Financial Analysis', 'Strategic Planning', 'Change Management'],
    typicalProjects: ['Business Plan Development', 'Operational Assessment', 'Growth Strategy'],
    averageHourlyRate: { min: 200, max: 600 }
  },
  {
    id: 'franchise_consultant',
    name: 'Food Franchise Consultant',
    description: 'Franchise development, operations, and compliance specialist',
    category: FOOD_EXPERT_CATEGORIES.BUSINESS_STRATEGY,
    subcategories: ['Franchise Development', 'Operations Manual', 'Franchise Compliance'],
    requiredCertifications: ['Certified Franchise Executive'],
    relatedSkills: ['Franchise Law', 'Operations Standardization', 'Training Development'],
    typicalProjects: ['Franchise Program Development', 'FDD Creation', 'Operations Manual'],
    averageHourlyRate: { min: 175, max: 450 }
  },

  // Marketing & Branding
  {
    id: 'food_marketing_strategist',
    name: 'Food Marketing Strategist',
    description: 'Brand development, marketing strategy, and consumer insights expert',
    category: FOOD_EXPERT_CATEGORIES.MARKETING_BRANDING,
    subcategories: ['Brand Strategy', 'Digital Marketing', 'Consumer Research'],
    requiredCertifications: ['Marketing Certification'],
    relatedSkills: ['Brand Development', 'Digital Marketing', 'Market Research'],
    typicalProjects: ['Brand Launch', 'Marketing Strategy', 'Consumer Research'],
    averageHourlyRate: { min: 125, max: 400 }
  },
  {
    id: 'food_photographer',
    name: 'Food Photography & Styling Expert',
    description: 'Professional food photography, styling, and visual content creation',
    category: FOOD_EXPERT_CATEGORIES.MARKETING_BRANDING,
    subcategories: ['Product Photography', 'Food Styling', 'Video Production'],
    requiredCertifications: ['Professional Photography Certification'],
    relatedSkills: ['Photography', 'Food Styling', 'Photo Editing', 'Video Production'],
    typicalProjects: ['Product Catalog Shoots', 'Marketing Campaigns', 'Social Media Content'],
    averageHourlyRate: { min: 100, max: 350 }
  }
];

// Helper functions for specialization management

export function getSpecializationById(id: string): Specialization | undefined {
  return EXPERT_SPECIALIZATIONS.find(spec => spec.id === id);
}

export function getSpecializationsByCategory(category: string): Specialization[] {
  return EXPERT_SPECIALIZATIONS.filter(spec => spec.category === category);
}

export function searchSpecializations(query: string): Specialization[] {
  const lowerQuery = query.toLowerCase();
  return EXPERT_SPECIALIZATIONS.filter(spec => 
    spec.name.toLowerCase().includes(lowerQuery) ||
    spec.description.toLowerCase().includes(lowerQuery) ||
    spec.relatedSkills.some(skill => skill.toLowerCase().includes(lowerQuery)) ||
    spec.subcategories.some(sub => sub.toLowerCase().includes(lowerQuery))
  );
}

export function getRelatedSpecializations(specializationId: string): Specialization[] {
  const specialization = getSpecializationById(specializationId);
  if (!specialization) return [];

  // Find specializations in same category or with overlapping skills
  return EXPERT_SPECIALIZATIONS.filter(spec => 
    spec.id !== specializationId && (
      spec.category === specialization.category ||
      spec.relatedSkills.some(skill => specialization.relatedSkills.includes(skill))
    )
  ).slice(0, 5);
}

export function validateExpertSpecializations(specializations: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  specializations.forEach(specId => {
    if (!getSpecializationById(specId)) {
      errors.push(`Invalid specialization ID: ${specId}`);
    }
  });

  // Check for reasonable number of specializations
  if (specializations.length > 5) {
    errors.push('Maximum 5 specializations allowed');
  }

  // Check for conflicting specializations
  const categories = new Set<string>();
  specializations.forEach(specId => {
    const spec = getSpecializationById(specId);
    if (spec) {
      categories.add(spec.category);
    }
  });

  if (categories.size > 3) {
    errors.push('Specializations should focus on maximum 3 categories for credibility');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}