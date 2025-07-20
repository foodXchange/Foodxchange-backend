/**
 * Advanced Matching Algorithms for FoodXchange Recommendation Engine
 * Implements sophisticated algorithms for supplier-product-buyer matching
 */

import { Logger } from '../../core/logging/logger';

export interface MatchingCriteria {
  weight: number;
  threshold: number;
  isRequired?: boolean;
}

export interface MatchingWeights {
  priceMatch: MatchingCriteria;
  qualityMatch: MatchingCriteria;
  certificationMatch: MatchingCriteria;
  locationProximity: MatchingCriteria;
  supplierReliability: MatchingCriteria;
  deliverySpeed: MatchingCriteria;
  quantityCapability: MatchingCriteria;
  categoryExpertise: MatchingCriteria;
  userPreference: MatchingCriteria;
  historicalPerformance: MatchingCriteria;
}

export interface SupplierProfile {
  id: string;
  name: string;
  location: { lat: number; lng: number; city: string; country: string };
  certifications: string[];
  categories: string[];
  averageRating: number;
  responseTime: number; // hours
  fulfillmentRate: number; // 0-1
  qualityScore: number; // 0-1
  priceCompetitiveness: number; // 0-1
  capacityTiers: { category: string; maxQuantity: number }[];
  deliveryCapabilities: {
    regions: string[];
    averageDeliveryTime: number; // days
    expeditedAvailable: boolean;
  };
}

export interface ProductProfile {
  id: string;
  name: string;
  category: string;
  specifications: Record<string, any>;
  supplierId: string;
  basePrice: number;
  minimumOrder: number;
  maximumOrder: number;
  certifications: string[];
  qualityGrade: string;
  shelfLife: number; // days
  storageRequirements: string[];
  seasonality?: {
    available: boolean;
    peak: string[]; // months
    limited: string[]; // months
  };
}

export interface BuyerRequirements {
  productCategory: string;
  specifications: Record<string, any>;
  quantity: number;
  maxBudget?: number;
  requiredCertifications: string[];
  deliveryLocation: { lat: number; lng: number; city: string; country: string };
  maxDeliveryTime: number; // days
  qualityRequirements: string[];
  urgency: 'low' | 'medium' | 'high';
  preferredSuppliers: string[];
  blacklistedSuppliers: string[];
}

export interface MatchResult {
  score: number;
  confidence: number;
  breakdown: {
    criterion: string;
    score: number;
    weight: number;
    details: string;
  }[];
  recommendations: string[];
  warnings: string[];
}

export class MatchingAlgorithms {
  private readonly logger: Logger;
  private readonly defaultWeights: MatchingWeights;

  constructor() {
    this.logger = new Logger('MatchingAlgorithms');
    this.defaultWeights = this.getDefaultWeights();
  }

  /**
   * Match suppliers to buyer requirements using multi-criteria algorithm
   */
  public matchSuppliersToRequirements(
    suppliers: SupplierProfile[],
    requirements: BuyerRequirements,
    weights?: Partial<MatchingWeights>
  ): (SupplierProfile & { matchResult: MatchResult })[] {
    const finalWeights = { ...this.defaultWeights, ...weights };

    return suppliers
      .map(supplier => ({
        ...supplier,
        matchResult: this.calculateSupplierMatch(supplier, requirements, finalWeights)
      }))
      .filter(result => result.matchResult.score >= 0.1) // Filter out very poor matches
      .sort((a, b) => b.matchResult.score - a.matchResult.score);
  }

  /**
   * Match products to buyer requirements
   */
  public matchProductsToRequirements(
    products: ProductProfile[],
    suppliers: SupplierProfile[],
    requirements: BuyerRequirements,
    weights?: Partial<MatchingWeights>
  ): (ProductProfile & { supplier: SupplierProfile; matchResult: MatchResult })[] {
    const finalWeights = { ...this.defaultWeights, ...weights };
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));

    return products
      .filter(product => {
        const supplier = supplierMap.get(product.supplierId);
        return supplier && this.isBasicMatch(product, supplier, requirements);
      })
      .map(product => {
        const supplier = supplierMap.get(product.supplierId);
        return {
          ...product,
          supplier,
          matchResult: this.calculateProductMatch(product, supplier, requirements, finalWeights)
        };
      })
      .filter(result => result.matchResult.score >= 0.1)
      .sort((a, b) => b.matchResult.score - a.matchResult.score);
  }

  /**
   * Find similar suppliers based on profile characteristics
   */
  public findSimilarSuppliers(
    targetSupplier: SupplierProfile,
    allSuppliers: SupplierProfile[],
    limit: number = 5
  ): (SupplierProfile & { similarityScore: number })[] {
    return allSuppliers
      .filter(supplier => supplier.id !== targetSupplier.id)
      .map(supplier => ({
        ...supplier,
        similarityScore: this.calculateSupplierSimilarity(targetSupplier, supplier)
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
  }

  /**
   * Calculate supplier-requirement match score
   */
  private calculateSupplierMatch(
    supplier: SupplierProfile,
    requirements: BuyerRequirements,
    weights: MatchingWeights
  ): MatchResult {
    const breakdown: MatchResult['breakdown'] = [];
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Price competitiveness
    const priceScore = this.calculatePriceScore(supplier.priceCompetitiveness, requirements.maxBudget);
    breakdown.push({
      criterion: 'Price Competitiveness',
      score: priceScore,
      weight: weights.priceMatch.weight,
      details: `Supplier price competitiveness: ${(supplier.priceCompetitiveness * 100).toFixed(1)}%`
    });

    // Certification match
    const certScore = this.calculateCertificationMatch(supplier.certifications, requirements.requiredCertifications);
    breakdown.push({
      criterion: 'Certification Match',
      score: certScore,
      weight: weights.certificationMatch.weight,
      details: `Matches ${this.getMatchingCertifications(supplier.certifications, requirements.requiredCertifications).length}/${requirements.requiredCertifications.length} required certifications`
    });

    if (certScore < weights.certificationMatch.threshold) {
      warnings.push('Missing required certifications');
    }

    // Location proximity
    const locationScore = this.calculateLocationProximity(supplier.location, requirements.deliveryLocation);
    breakdown.push({
      criterion: 'Location Proximity',
      score: locationScore,
      weight: weights.locationProximity.weight,
      details: 'Distance-based delivery feasibility score'
    });

    // Supplier reliability
    const reliabilityScore = this.calculateReliabilityScore(supplier);
    breakdown.push({
      criterion: 'Supplier Reliability',
      score: reliabilityScore,
      weight: weights.supplierReliability.weight,
      details: `Based on rating (${supplier.averageRating}/5), fulfillment rate (${(supplier.fulfillmentRate * 100).toFixed(1)}%)`
    });

    // Delivery capability
    const deliveryScore = this.calculateDeliveryScore(supplier, requirements);
    breakdown.push({
      criterion: 'Delivery Capability',
      score: deliveryScore,
      weight: weights.deliverySpeed.weight,
      details: `Average delivery: ${supplier.deliveryCapabilities.averageDeliveryTime} days, Required: ${requirements.maxDeliveryTime} days`
    });

    // Quantity capability
    const quantityScore = this.calculateQuantityCapability(supplier, requirements);
    breakdown.push({
      criterion: 'Quantity Capability',
      score: quantityScore,
      weight: weights.quantityCapability.weight,
      details: `Can fulfill requested quantity: ${requirements.quantity}`
    });

    // Category expertise
    const expertiseScore = this.calculateCategoryExpertise(supplier.categories, requirements.productCategory);
    breakdown.push({
      criterion: 'Category Expertise',
      score: expertiseScore,
      weight: weights.categoryExpertise.weight,
      details: `Specializes in ${requirements.productCategory}: ${expertiseScore > 0.7 ? 'Yes' : 'Partial'}`
    });

    // User preference
    const preferenceScore = this.calculateUserPreference(supplier, requirements);
    breakdown.push({
      criterion: 'User Preference',
      score: preferenceScore,
      weight: weights.userPreference.weight,
      details: preferenceScore > 0 ? 'Preferred supplier' : 'No preference indicated'
    });

    // Calculate weighted total score
    const totalScore = breakdown.reduce((sum, item) => sum + (item.score * item.weight), 0);
    const totalWeight = breakdown.reduce((sum, item) => sum + item.weight, 0);
    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Generate recommendations
    if (reliabilityScore > 0.8) recommendations.push('Highly reliable supplier');
    if (deliveryScore > 0.8) recommendations.push('Fast delivery available');
    if (expertiseScore > 0.8) recommendations.push('Category specialist');
    if (preferenceScore > 0) recommendations.push('Previously preferred supplier');

    // Calculate confidence based on data completeness
    const confidence = this.calculateConfidence(supplier, requirements);

    return {
      score: Math.max(0, Math.min(1, normalizedScore)),
      confidence,
      breakdown,
      recommendations,
      warnings
    };
  }

  /**
   * Calculate product-requirement match score
   */
  private calculateProductMatch(
    product: ProductProfile,
    supplier: SupplierProfile,
    requirements: BuyerRequirements,
    weights: MatchingWeights
  ): MatchResult {
    const breakdown: MatchResult['breakdown'] = [];
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Specification match
    const specScore = this.calculateSpecificationMatch(product.specifications, requirements.specifications);
    breakdown.push({
      criterion: 'Specification Match',
      score: specScore,
      weight: 0.3,
      details: `Matches ${(specScore * 100).toFixed(1)}% of required specifications`
    });

    // Price match
    const priceScore = requirements.maxBudget
      ? this.calculateProductPriceMatch(product.basePrice, requirements.quantity, requirements.maxBudget)
      : 1.0;
    breakdown.push({
      criterion: 'Price Match',
      score: priceScore,
      weight: weights.priceMatch.weight,
      details: `Estimated cost: $${(product.basePrice * requirements.quantity).toFixed(2)}${requirements.maxBudget ? ` / Budget: $${requirements.maxBudget}` : ''}`
    });

    // Quality match
    const qualityScore = this.calculateQualityMatch(product, requirements);
    breakdown.push({
      criterion: 'Quality Match',
      score: qualityScore,
      weight: weights.qualityMatch.weight,
      details: `Quality grade: ${product.qualityGrade}`
    });

    // Quantity feasibility
    const quantityFeasible = this.isQuantityFeasible(product, requirements.quantity);
    const quantityScore = quantityFeasible ? 1.0 : 0.0;
    breakdown.push({
      criterion: 'Quantity Feasibility',
      score: quantityScore,
      weight: 0.2,
      details: `Min: ${product.minimumOrder}, Max: ${product.maximumOrder}, Requested: ${requirements.quantity}`
    });

    if (!quantityFeasible) {
      warnings.push(`Quantity ${requirements.quantity} outside product range (${product.minimumOrder}-${product.maximumOrder})`);
    }

    // Certification match
    const certScore = this.calculateCertificationMatch(product.certifications, requirements.requiredCertifications);
    breakdown.push({
      criterion: 'Product Certifications',
      score: certScore,
      weight: weights.certificationMatch.weight,
      details: `Product has ${this.getMatchingCertifications(product.certifications, requirements.requiredCertifications).length}/${requirements.requiredCertifications.length} required certifications`
    });

    // Include supplier factors
    const supplierMatch = this.calculateSupplierMatch(supplier, requirements, weights);
    breakdown.push(...supplierMatch.breakdown.map(item => ({...item, weight: item.weight * 0.4}))); // Reduce supplier weight for product matching

    // Calculate total score
    const totalScore = breakdown.reduce((sum, item) => sum + (item.score * item.weight), 0);
    const totalWeight = breakdown.reduce((sum, item) => sum + item.weight, 0);
    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Generate recommendations
    if (specScore > 0.9) recommendations.push('Excellent specification match');
    if (priceScore > 0.8) recommendations.push('Good value for money');
    if (qualityScore > 0.8) recommendations.push('High quality product');
    if (product.seasonality?.available) recommendations.push('Currently in season');

    const confidence = this.calculateProductConfidence(product, supplier, requirements);

    return {
      score: Math.max(0, Math.min(1, normalizedScore)),
      confidence,
      breakdown,
      recommendations,
      warnings
    };
  }

  /**
   * Calculate similarity between two suppliers
   */
  private calculateSupplierSimilarity(supplier1: SupplierProfile, supplier2: SupplierProfile): number {
    let similarity = 0;
    let factors = 0;

    // Category overlap
    const categoryOverlap = this.calculateSetOverlap(supplier1.categories, supplier2.categories);
    similarity += categoryOverlap * 0.3;
    factors += 0.3;

    // Certification overlap
    const certOverlap = this.calculateSetOverlap(supplier1.certifications, supplier2.certifications);
    similarity += certOverlap * 0.2;
    factors += 0.2;

    // Performance similarity
    const ratingDiff = Math.abs(supplier1.averageRating - supplier2.averageRating) / 5;
    const ratingSim = 1 - ratingDiff;
    similarity += ratingSim * 0.2;
    factors += 0.2;

    // Location proximity (same country = 0.5, same continent = 0.3, else 0)
    const locationSim = supplier1.location.country === supplier2.location.country ? 0.5 : 0;
    similarity += locationSim * 0.15;
    factors += 0.15;

    // Size similarity (based on capacity)
    const capacity1 = supplier1.capacityTiers.reduce((sum, tier) => sum + tier.maxQuantity, 0);
    const capacity2 = supplier2.capacityTiers.reduce((sum, tier) => sum + tier.maxQuantity, 0);
    const capacityRatio = Math.min(capacity1, capacity2) / Math.max(capacity1, capacity2);
    similarity += capacityRatio * 0.15;
    factors += 0.15;

    return factors > 0 ? similarity / factors : 0;
  }

  // Helper methods for scoring calculations

  private calculatePriceScore(priceCompetitiveness: number, maxBudget?: number): number {
    // If no budget constraint, use price competitiveness directly
    if (!maxBudget) return priceCompetitiveness;

    // Factor in budget constraint
    return Math.min(priceCompetitiveness, 1.0);
  }

  private calculateProductPriceMatch(unitPrice: number, quantity: number, maxBudget: number): number {
    const totalCost = unitPrice * quantity;
    if (totalCost <= maxBudget) return 1.0;

    // Soft penalty for exceeding budget
    const overage = (totalCost - maxBudget) / maxBudget;
    return Math.max(0, 1 - overage);
  }

  private calculateCertificationMatch(supplierCerts: string[], requiredCerts: string[]): number {
    if (requiredCerts.length === 0) return 1.0;

    const matches = this.getMatchingCertifications(supplierCerts, requiredCerts);
    return matches.length / requiredCerts.length;
  }

  private getMatchingCertifications(supplierCerts: string[], requiredCerts: string[]): string[] {
    return requiredCerts.filter(cert =>
      supplierCerts.some(sCert =>
        sCert.toLowerCase().includes(cert.toLowerCase()) ||
        cert.toLowerCase().includes(sCert.toLowerCase())
      )
    );
  }

  private calculateLocationProximity(
    supplierLocation: { lat: number; lng: number },
    deliveryLocation: { lat: number; lng: number }
  ): number {
    const distance = this.haversineDistance(
      supplierLocation.lat, supplierLocation.lng,
      deliveryLocation.lat, deliveryLocation.lng
    );

    // Score decreases with distance, max useful distance = 5000km
    const maxDistance = 5000;
    return Math.max(0, 1 - (distance / maxDistance));
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private calculateReliabilityScore(supplier: SupplierProfile): number {
    const ratingScore = supplier.averageRating / 5; // Normalize to 0-1
    const fulfillmentScore = supplier.fulfillmentRate;
    const responseScore = Math.max(0, 1 - (supplier.responseTime / 72)); // 72 hours = 0 score

    return (ratingScore * 0.4 + fulfillmentScore * 0.4 + responseScore * 0.2);
  }

  private calculateDeliveryScore(supplier: SupplierProfile, requirements: BuyerRequirements): number {
    const avgDelivery = supplier.deliveryCapabilities.averageDeliveryTime;
    const maxDelivery = requirements.maxDeliveryTime;

    if (avgDelivery <= maxDelivery) {
      // Bonus for faster delivery
      return Math.min(1.0, 1 + (maxDelivery - avgDelivery) / maxDelivery * 0.2);
    }
    // Penalty for slower delivery
    const penalty = (avgDelivery - maxDelivery) / maxDelivery;
    return Math.max(0, 1 - penalty);

  }

  private calculateQuantityCapability(supplier: SupplierProfile, requirements: BuyerRequirements): number {
    const relevantTier = supplier.capacityTiers.find(tier =>
      tier.category === requirements.productCategory || tier.category === 'general'
    );

    if (!relevantTier) return 0.5; // Assume medium capability if no data

    return requirements.quantity <= relevantTier.maxQuantity ? 1.0 :
      Math.max(0, 1 - (requirements.quantity - relevantTier.maxQuantity) / relevantTier.maxQuantity);
  }

  private calculateCategoryExpertise(supplierCategories: string[], requiredCategory: string): number {
    // Exact match
    if (supplierCategories.includes(requiredCategory)) return 1.0;

    // Partial match based on category hierarchy or similarity
    const partialMatches = supplierCategories.filter(cat =>
      cat.toLowerCase().includes(requiredCategory.toLowerCase()) ||
      requiredCategory.toLowerCase().includes(cat.toLowerCase())
    );

    return partialMatches.length > 0 ? 0.7 : 0.3; // Some credit for related categories
  }

  private calculateUserPreference(supplier: SupplierProfile, requirements: BuyerRequirements): number {
    if (requirements.blacklistedSuppliers.includes(supplier.id)) return 0;
    if (requirements.preferredSuppliers.includes(supplier.id)) return 1.0;
    return 0.5; // Neutral
  }

  private calculateSpecificationMatch(productSpecs: Record<string, any>, requiredSpecs: Record<string, any>): number {
    const requiredKeys = Object.keys(requiredSpecs);
    if (requiredKeys.length === 0) return 1.0;

    let matches = 0;
    requiredKeys.forEach(key => {
      if (productSpecs[key] !== undefined) {
        if (this.isSpecMatch(productSpecs[key], requiredSpecs[key])) {
          matches++;
        }
      }
    });

    return matches / requiredKeys.length;
  }

  private isSpecMatch(productValue: any, requiredValue: any): boolean {
    if (typeof requiredValue === 'string' && typeof productValue === 'string') {
      return productValue.toLowerCase().includes(requiredValue.toLowerCase());
    }
    if (typeof requiredValue === 'number' && typeof productValue === 'number') {
      return Math.abs(productValue - requiredValue) / requiredValue <= 0.1; // 10% tolerance
    }
    return productValue === requiredValue;
  }

  private calculateQualityMatch(product: ProductProfile, requirements: BuyerRequirements): number {
    // Simple quality grade mapping
    const qualityMap: Record<string, number> = {
      'premium': 1.0,
      'high': 0.8,
      'standard': 0.6,
      'basic': 0.4
    };

    return qualityMap[product.qualityGrade.toLowerCase()] || 0.5;
  }

  private isQuantityFeasible(product: ProductProfile, requestedQuantity: number): boolean {
    return requestedQuantity >= product.minimumOrder && requestedQuantity <= product.maximumOrder;
  }

  private isBasicMatch(product: ProductProfile, supplier: SupplierProfile, requirements: BuyerRequirements): boolean {
    // Basic filters
    if (requirements.blacklistedSuppliers.includes(supplier.id)) return false;
    if (!this.isQuantityFeasible(product, requirements.quantity)) return false;

    // Must have at least some required certifications
    const certMatch = this.calculateCertificationMatch(
      [...product.certifications, ...supplier.certifications],
      requirements.requiredCertifications
    );

    return certMatch >= 0.5; // At least 50% cert match
  }

  private calculateConfidence(supplier: SupplierProfile, requirements: BuyerRequirements): number {
    let confidence = 0.5; // Base confidence

    // More data = higher confidence
    if (supplier.averageRating > 0) confidence += 0.1;
    if (supplier.fulfillmentRate > 0) confidence += 0.1;
    if (supplier.categories.length > 0) confidence += 0.1;
    if (supplier.certifications.length > 0) confidence += 0.1;
    if (supplier.capacityTiers.length > 0) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private calculateProductConfidence(product: ProductProfile, supplier: SupplierProfile, requirements: BuyerRequirements): number {
    let confidence = 0.4; // Lower base for products

    if (Object.keys(product.specifications).length > 0) confidence += 0.15;
    if (product.certifications.length > 0) confidence += 0.15;
    if (product.qualityGrade) confidence += 0.1;
    if (supplier.averageRating > 0) confidence += 0.1;
    if (product.seasonality) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private calculateSetOverlap(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) return 1.0;
    if (set1.length === 0 || set2.length === 0) return 0.0;

    const intersection = set1.filter(item => set2.includes(item));
    const union = [...new Set([...set1, ...set2])];

    return intersection.length / union.length;
  }

  private getDefaultWeights(): MatchingWeights {
    return {
      priceMatch: { weight: 0.20, threshold: 0.3 },
      qualityMatch: { weight: 0.15, threshold: 0.4 },
      certificationMatch: { weight: 0.20, threshold: 0.7, isRequired: true },
      locationProximity: { weight: 0.10, threshold: 0.2 },
      supplierReliability: { weight: 0.15, threshold: 0.5 },
      deliverySpeed: { weight: 0.10, threshold: 0.3 },
      quantityCapability: { weight: 0.05, threshold: 0.8, isRequired: true },
      categoryExpertise: { weight: 0.03, threshold: 0.3 },
      userPreference: { weight: 0.01, threshold: 0.0 },
      historicalPerformance: { weight: 0.01, threshold: 0.0 }
    };
  }
}
