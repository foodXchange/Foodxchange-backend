import { Request, Response } from 'express';
import { ExpertProfile, ExpertService, ExpertReview } from '../models';
import { Logger } from '../utils/logger';
import { asyncHandler } from '../middleware/asyncHandler';
import { CacheService } from '../services/CacheService';
import { ExpertMatchingEngine } from '../services/ExpertMatchingEngine';
import { ValidationError } from '../utils/errors';
import { 
  EXPERT_SPECIALIZATIONS,
  FOOD_EXPERT_CATEGORIES,
  searchSpecializations,
  getSpecializationsByCategory
} from '../config/expertSpecializations';

const logger = new Logger('SearchController');

export class SearchController {
  private cacheService: CacheService;
  private matchingEngine: ExpertMatchingEngine;

  constructor() {
    this.cacheService = new CacheService();
    this.matchingEngine = new ExpertMatchingEngine();
  }

  /**
   * Search experts with advanced filtering
   */
  searchExperts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      q, // search query
      category,
      subcategory,
      location,
      country,
      minRate,
      maxRate,
      rating,
      languages,
      verificationStatus = 'verified',
      availability,
      sortBy = 'relevance',
      page = 1,
      limit = 20
    } = req.query;

    try {
      // Check cache first
      const searchParams = {
        q, category, subcategory, location, country,
        minRate, maxRate, rating, languages, verificationStatus,
        availability, sortBy, page, limit
      };

      const cacheKey = `search:experts:${JSON.stringify(searchParams)}`;
      let cachedResults = await this.cacheService.get(cacheKey);

      if (cachedResults) {
        return res.status(200).json({
          success: true,
          data: cachedResults,
          cached: true
        });
      }

      // Build search query
      const searchQuery: any = {
        status: 'active',
        isActive: true
      };

      // Verification status filter
      if (verificationStatus) {
        searchQuery.verificationStatus = verificationStatus;
      }

      // Text search
      if (q) {
        searchQuery.$text = { $search: q };
      }

      // Category filter
      if (category) {
        searchQuery['expertise.category'] = category;
      }

      // Location filter
      if (country) {
        searchQuery['location.country'] = country;
      }

      if (location) {
        searchQuery.$or = [
          { 'location.city': new RegExp(location as string, 'i') },
          { 'location.state': new RegExp(location as string, 'i') },
          { 'location.country': new RegExp(location as string, 'i') }
        ];
      }

      // Rate filter
      if (minRate || maxRate) {
        const rateFilter: any = {};
        if (minRate) rateFilter.$gte = Number(minRate);
        if (maxRate) rateFilter.$lte = Number(maxRate);
        searchQuery['hourlyRate.min'] = rateFilter;
      }

      // Rating filter
      if (rating) {
        searchQuery['rating.average'] = { $gte: Number(rating) };
      }

      // Languages filter
      if (languages) {
        const languageArray = Array.isArray(languages) ? languages : [languages];
        searchQuery.languages = { $in: languageArray };
      }

      // Build sort options
      let sortOptions: any = {};
      switch (sortBy) {
        case 'rating':
          sortOptions = { 'rating.average': -1, 'rating.count': -1 };
          break;
        case 'experience':
          sortOptions = { completedProjects: -1, createdAt: -1 };
          break;
        case 'rate_low':
          sortOptions = { 'hourlyRate.min': 1 };
          break;
        case 'rate_high':
          sortOptions = { 'hourlyRate.min': -1 };
          break;
        case 'newest':
          sortOptions = { createdAt: -1 };
          break;
        case 'relevance':
        default:
          if (q) {
            sortOptions = { score: { $meta: 'textScore' } };
          } else {
            sortOptions = { 'rating.average': -1, completedProjects: -1 };
          }
          break;
      }

      // Execute search
      const experts = await ExpertProfile.find(searchQuery)
        .select('-documents -twoFactorSecret -securitySettings -__v')
        .sort(sortOptions)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      // Get total count
      const total = await ExpertProfile.countDocuments(searchQuery);

      // Get services for each expert
      const expertIds = experts.map(expert => expert._id);
      const services = await ExpertService.find({
        expertId: { $in: expertIds },
        isActive: true
      }).select('expertId title category pricing rating').lean();

      const servicesMap = services.reduce((acc, service) => {
        const expertId = service.expertId.toString();
        if (!acc[expertId]) acc[expertId] = [];
        acc[expertId].push(service);
        return acc;
      }, {} as Record<string, any[]>);

      // Enhance experts with services
      const enhancedExperts = experts.map(expert => ({
        ...expert,
        services: servicesMap[expert._id.toString()] || [],
        fullName: `${expert.firstName} ${expert.lastName}`,
        isAvailable: this.checkAvailability(expert.availability),
        matchScore: q ? this.calculateRelevanceScore(expert, q as string) : undefined
      }));

      const searchResults = {
        experts: enhancedExperts,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        filters: {
          categories: await this.getAvailableCategories(),
          countries: await this.getAvailableCountries(),
          languages: await this.getAvailableLanguages(),
          rateRange: await this.getRateRange()
        }
      };

      // Cache results
      await this.cacheService.set(cacheKey, searchResults, { ttl: 300 }); // 5 minutes

      res.status(200).json({
        success: true,
        data: searchResults
      });
    } catch (error) {
      logger.error('Search experts failed:', error);
      throw error;
    }
  });

  /**
   * Get expert suggestions based on RFQ
   */
  suggestExperts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      title,
      description,
      requirements = [],
      budget,
      urgency = 'medium',
      limit = 10
    } = req.body;

    if (!title || !description) {
      throw new ValidationError('RFQ title and description required');
    }

    try {
      const suggestions = await this.matchingEngine.analyzeRFQAndMatch({
        title,
        description,
        requirements,
        budget,
        urgency
      });

      // Get additional expert data
      const expertIds = suggestions.slice(0, Number(limit)).map(s => s.expertId);
      const experts = await ExpertProfile.find({
        _id: { $in: expertIds }
      }).select('firstName lastName profilePhoto rating completedProjects hourlyRate').lean();

      const expertMap = experts.reduce((acc, expert) => {
        acc[expert._id.toString()] = expert;
        return acc;
      }, {} as Record<string, any>);

      const enhancedSuggestions = suggestions.slice(0, Number(limit)).map(suggestion => ({
        ...suggestion,
        expert: expertMap[suggestion.expertId],
        fullName: expertMap[suggestion.expertId] ? 
          `${expertMap[suggestion.expertId].firstName} ${expertMap[suggestion.expertId].lastName}` : 
          'Unknown Expert'
      }));

      res.status(200).json({
        success: true,
        data: {
          suggestions: enhancedSuggestions,
          analysisInfo: {
            extractedRequirements: requirements,
            urgencyLevel: urgency,
            budgetRange: budget ? {
              suggested: budget,
              min: budget * 0.8,
              max: budget * 1.2
            } : null
          }
        }
      });
    } catch (error) {
      logger.error('Suggest experts failed:', error);
      throw error;
    }
  });

  /**
   * Search expert services
   */
  searchServices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      q,
      category,
      pricingType,
      minPrice,
      maxPrice,
      rating,
      sortBy = 'relevance',
      page = 1,
      limit = 20
    } = req.query;

    try {
      // Build search query
      const searchQuery: any = {
        isActive: true,
        'expertId': {
          $in: await ExpertProfile.distinct('_id', {
            status: 'active',
            verificationStatus: 'verified'
          })
        }
      };

      // Text search
      if (q) {
        searchQuery.$text = { $search: q };
      }

      // Category filter
      if (category) {
        searchQuery.category = category;
      }

      // Pricing type filter
      if (pricingType) {
        searchQuery['pricing.type'] = pricingType;
      }

      // Price range filter
      if (minPrice || maxPrice) {
        const priceFilter: any = {};
        if (minPrice) priceFilter.$gte = Number(minPrice);
        if (maxPrice) priceFilter.$lte = Number(maxPrice);
        
        if (pricingType === 'fixed') {
          searchQuery['pricing.fixedPrice'] = priceFilter;
        } else if (pricingType === 'hourly') {
          searchQuery['pricing.hourlyRate'] = priceFilter;
        }
      }

      // Rating filter
      if (rating) {
        searchQuery['rating.average'] = { $gte: Number(rating) };
      }

      // Build sort options
      let sortOptions: any = {};
      switch (sortBy) {
        case 'price_low':
          sortOptions = { 'pricing.fixedPrice': 1, 'pricing.hourlyRate': 1 };
          break;
        case 'price_high':
          sortOptions = { 'pricing.fixedPrice': -1, 'pricing.hourlyRate': -1 };
          break;
        case 'rating':
          sortOptions = { 'rating.average': -1, 'rating.count': -1 };
          break;
        case 'popular':
          sortOptions = { bookingCount: -1, viewCount: -1 };
          break;
        case 'newest':
          sortOptions = { createdAt: -1 };
          break;
        case 'relevance':
        default:
          if (q) {
            sortOptions = { score: { $meta: 'textScore' } };
          } else {
            sortOptions = { 'rating.average': -1, bookingCount: -1 };
          }
          break;
      }

      // Execute search
      const services = await ExpertService.find(searchQuery)
        .sort(sortOptions)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .populate('expertId', 'firstName lastName profilePhoto rating verificationStatus')
        .lean();

      const total = await ExpertService.countDocuments(searchQuery);

      const searchResults = {
        services,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      };

      res.status(200).json({
        success: true,
        data: searchResults
      });
    } catch (error) {
      logger.error('Search services failed:', error);
      throw error;
    }
  });

  /**
   * Get expert specializations and categories
   */
  getSpecializations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { category, search } = req.query;

    try {
      let specializations = EXPERT_SPECIALIZATIONS;

      // Filter by category
      if (category) {
        specializations = getSpecializationsByCategory(category as string);
      }

      // Search specializations
      if (search) {
        specializations = searchSpecializations(search as string);
      }

      res.status(200).json({
        success: true,
        data: {
          specializations: specializations.map(spec => ({
            id: spec.id,
            name: spec.name,
            description: spec.description,
            category: spec.category,
            subcategories: spec.subcategories,
            averageHourlyRate: spec.averageHourlyRate,
            relatedSkills: spec.relatedSkills.slice(0, 5) // Limit for API response
          })),
          categories: Object.values(FOOD_EXPERT_CATEGORIES),
          totalCount: specializations.length
        }
      });
    } catch (error) {
      logger.error('Get specializations failed:', error);
      throw error;
    }
  });

  /**
   * Get search suggestions (autocomplete)
   */
  getSearchSuggestions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { q, type = 'experts' } = req.query;

    if (!q || (q as string).length < 2) {
      return res.status(200).json({
        success: true,
        data: { suggestions: [] }
      });
    }

    try {
      const query = q as string;
      const suggestions: string[] = [];

      if (type === 'experts' || type === 'all') {
        // Get expert name suggestions
        const expertSuggestions = await ExpertProfile.find({
          $or: [
            { firstName: new RegExp(query, 'i') },
            { lastName: new RegExp(query, 'i') },
            { headline: new RegExp(query, 'i') }
          ],
          status: 'active',
          verificationStatus: 'verified'
        })
        .select('firstName lastName headline')
        .limit(5)
        .lean();

        suggestions.push(
          ...expertSuggestions.map(expert => `${expert.firstName} ${expert.lastName}`),
          ...expertSuggestions.map(expert => expert.headline).filter(Boolean)
        );
      }

      if (type === 'specializations' || type === 'all') {
        // Get specialization suggestions
        const specializationSuggestions = searchSpecializations(query)
          .slice(0, 5)
          .map(spec => spec.name);
        
        suggestions.push(...specializationSuggestions);
      }

      if (type === 'services' || type === 'all') {
        // Get service suggestions
        const serviceSuggestions = await ExpertService.find({
          $or: [
            { title: new RegExp(query, 'i') },
            { category: new RegExp(query, 'i') },
            { tags: new RegExp(query, 'i') }
          ],
          isActive: true
        })
        .select('title category')
        .limit(5)
        .lean();

        suggestions.push(
          ...serviceSuggestions.map(service => service.title),
          ...serviceSuggestions.map(service => service.category)
        );
      }

      // Remove duplicates and limit results
      const uniqueSuggestions = [...new Set(suggestions)].slice(0, 10);

      res.status(200).json({
        success: true,
        data: { suggestions: uniqueSuggestions }
      });
    } catch (error) {
      logger.error('Get search suggestions failed:', error);
      throw error;
    }
  });

  /**
   * Get trending searches and popular experts
   */
  getTrendingData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Get trending specializations (mock data for now)
      const trendingSpecializations = [
        'HACCP Specialist',
        'FDA Compliance',
        'Sustainability Consultant',
        'Food Safety',
        'Supply Chain Optimization'
      ];

      // Get popular experts (high rating + recent activity)
      const popularExperts = await ExpertProfile.find({
        status: 'active',
        verificationStatus: 'verified',
        'rating.average': { $gte: 4.5 },
        'rating.count': { $gte: 5 }
      })
      .select('firstName lastName profilePhoto rating expertise completedProjects')
      .sort({ 'rating.average': -1, completedProjects: -1 })
      .limit(8)
      .lean();

      // Get featured services
      const featuredServices = await ExpertService.find({
        isActive: true,
        'rating.average': { $gte: 4.0 },
        bookingCount: { $gte: 3 }
      })
      .select('title category pricing rating expertId')
      .populate('expertId', 'firstName lastName profilePhoto')
      .sort({ 'rating.average': -1, bookingCount: -1 })
      .limit(6)
      .lean();

      res.status(200).json({
        success: true,
        data: {
          trendingSpecializations,
          popularExperts: popularExperts.map(expert => ({
            ...expert,
            fullName: `${expert.firstName} ${expert.lastName}`
          })),
          featuredServices
        }
      });
    } catch (error) {
      logger.error('Get trending data failed:', error);
      throw error;
    }
  });

  // Helper methods

  private checkAvailability(availability: any[]): boolean {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    return availability.some(slot => {
      if (slot.dayOfWeek !== currentDay) return false;
      
      const [startHour, startMin] = slot.startTime.split(':').map(Number);
      const [endHour, endMin] = slot.endTime.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      return currentTime >= startTime && currentTime <= endTime;
    });
  }

  private calculateRelevanceScore(expert: any, query: string): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    // Name match
    if (`${expert.firstName} ${expert.lastName}`.toLowerCase().includes(lowerQuery)) {
      score += 30;
    }

    // Headline match
    if (expert.headline.toLowerCase().includes(lowerQuery)) {
      score += 25;
    }

    // Bio match
    if (expert.bio.toLowerCase().includes(lowerQuery)) {
      score += 15;
    }

    // Expertise match
    expert.expertise.forEach((exp: any) => {
      if (exp.category.toLowerCase().includes(lowerQuery)) {
        score += 20;
      }
      exp.subcategories.forEach((sub: string) => {
        if (sub.toLowerCase().includes(lowerQuery)) {
          score += 10;
        }
      });
    });

    // Rating boost
    score += expert.rating.average * 2;

    return Math.min(score, 100);
  }

  private async getAvailableCategories(): Promise<string[]> {
    return ExpertProfile.distinct('expertise.category', {
      status: 'active',
      verificationStatus: 'verified'
    });
  }

  private async getAvailableCountries(): Promise<string[]> {
    return ExpertProfile.distinct('location.country', {
      status: 'active',
      verificationStatus: 'verified'
    });
  }

  private async getAvailableLanguages(): Promise<string[]> {
    return ExpertProfile.distinct('languages', {
      status: 'active',
      verificationStatus: 'verified'
    });
  }

  private async getRateRange(): Promise<{ min: number; max: number }> {
    const result = await ExpertProfile.aggregate([
      {
        $match: {
          status: 'active',
          verificationStatus: 'verified'
        }
      },
      {
        $group: {
          _id: null,
          minRate: { $min: '$hourlyRate.min' },
          maxRate: { $max: '$hourlyRate.max' }
        }
      }
    ]);

    return result[0] || { min: 0, max: 1000 };
  }
}