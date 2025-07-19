// AI-Powered Supplier Matching Service
const aiConfig = require('./config');

class SupplierMatchingService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            const services = await aiConfig.initialize();
            this.openAI = services.openAI;
            this.textAnalytics = services.textAnalytics;
            this.search = services.search;
            this.initialized = true;
        }
    }

    async matchSuppliers(rfqData) {
        await this.initialize();
        
        try {
            // 1. Extract key requirements using Text Analytics
            const requirements = await this.extractRequirements(rfqData);
            
            // 2. Search for matching suppliers
            const suppliers = await this.searchSuppliers(requirements);
            
            // 3. Score and rank suppliers using AI
            const rankedSuppliers = await this.rankSuppliers(suppliers, rfqData);
            
            return {
                success: true,
                matches: rankedSuppliers,
                criteria: requirements,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Supplier matching error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async extractRequirements(rfqData) {
        if (!this.textAnalytics) {
            // Fallback to basic extraction
            return this.basicRequirementExtraction(rfqData);
        }

        const documents = [{
            id: '1',
            text: `${rfqData.title} ${rfqData.description}`,
            language: 'en'
        }];

        const keyPhraseResults = await this.textAnalytics.extractKeyPhrases(documents);
        const entityResults = await this.textAnalytics.recognizeEntities(documents);

        return {
            keyPhrases: keyPhraseResults[0]?.keyPhrases || [],
            entities: entityResults[0]?.entities || [],
            category: rfqData.category,
            certifications: rfqData.certifications || [],
            location: rfqData.deliveryLocation
        };
    }

    basicRequirementExtraction(rfqData) {
        // Fallback method when AI services are not available
        const keywords = rfqData.description.toLowerCase().split(' ')
            .filter(word => word.length > 3);
        
        return {
            keyPhrases: keywords.slice(0, 10),
            entities: [],
            category: rfqData.category,
            certifications: rfqData.certifications || [],
            location: rfqData.deliveryLocation
        };
    }

    async searchSuppliers(requirements) {
        try {
            // Dynamic import to avoid circular dependencies
            const { User } = require('../../models/User');
            const { Product } = require('../../models/Product');
            
            // Build search query
            const query = {
                role: 'seller',
                accountStatus: 'active'
            };
            
            // Find suppliers
            let suppliers = await User.find(query)
                .populate('company')
                .select('-password -refreshToken')
                .lean();
            
            // Filter and score suppliers based on requirements
            const scoredSuppliers = await Promise.all(suppliers.map(async (supplier) => {
                let score = 0;
                const matchReasons = [];
                
                // Check if supplier has products in the required category
                if (requirements.category) {
                    const categoryProductCount = await Product.countDocuments({
                        supplier: supplier._id,
                        category: requirements.category,
                        status: 'active'
                    });
                    
                    if (categoryProductCount > 0) {
                        score += 30;
                        matchReasons.push(`Has ${categoryProductCount} products in ${requirements.category} category`);
                    }
                }
                
                // Check location match (simplified - you might want to use geospatial queries)
                if (requirements.location && supplier.company) {
                    const supplierLocation = supplier.company.country || supplier.company.city;
                    if (supplierLocation && requirements.location.toLowerCase().includes(supplierLocation.toLowerCase())) {
                        score += 20;
                        matchReasons.push('Location match');
                    }
                }
                
                // Check certifications
                if (requirements.certifications && requirements.certifications.length > 0) {
                    const supplierCerts = supplier.certifications || [];
                    const matchingCerts = requirements.certifications.filter(cert => 
                        supplierCerts.some(sCert => sCert.toLowerCase().includes(cert.toLowerCase()))
                    );
                    
                    if (matchingCerts.length > 0) {
                        score += matchingCerts.length * 10;
                        matchReasons.push(`Has certifications: ${matchingCerts.join(', ')}`);
                    }
                }
                
                // Check if supplier has any products matching keywords
                if (requirements.keywords && requirements.keywords.length > 0) {
                    const keywordMatches = await Product.countDocuments({
                        supplier: supplier._id,
                        $or: [
                            { name: { $in: requirements.keywords.map(k => new RegExp(k, 'i')) } },
                            { description: { $in: requirements.keywords.map(k => new RegExp(k, 'i')) } },
                            { tags: { $in: requirements.keywords } }
                        ],
                        status: 'active'
                    });
                    
                    if (keywordMatches > 0) {
                        score += Math.min(keywordMatches * 5, 25);
                        matchReasons.push(`${keywordMatches} products match keywords`);
                    }
                }
                
                // Boost score for verified companies
                if (supplier.companyVerified) {
                    score += 10;
                    matchReasons.push('Verified company');
                }
                
                // Consider supplier rating
                if (supplier.rating && supplier.rating > 4) {
                    score += 15;
                    matchReasons.push(`High rating: ${supplier.rating}`);
                }
                
                // Get some sample products from this supplier
                const sampleProducts = await Product.find({
                    supplier: supplier._id,
                    status: 'active'
                })
                .limit(5)
                .select('name category pricing.basePrice images')
                .lean();
                
                return {
                    ...supplier,
                    matchScore: score,
                    matchReasons,
                    sampleProducts,
                    supplierInfo: {
                        id: supplier._id,
                        name: supplier.company?.name || `${supplier.firstName} ${supplier.lastName}`,
                        email: supplier.email,
                        phone: supplier.phone,
                        companyVerified: supplier.companyVerified,
                        rating: supplier.rating || 0,
                        location: supplier.company?.country || supplier.company?.city || 'Not specified'
                    }
                };
            }));
            
            // Filter out suppliers with score 0 and sort by score
            return scoredSuppliers
                .filter(s => s.matchScore > 0)
                .sort((a, b) => b.matchScore - a.matchScore)
                .slice(0, 20); // Return top 20 matches
                
        } catch (error) {
            console.error('Error searching suppliers:', error);
            return [];
        }
    }

    async rankSuppliers(suppliers, rfqData) {
        if (suppliers.length === 0) {
            return suppliers;
        }

        // If OpenAI is available, use it for advanced ranking
        if (this.openAI) {
            try {
                const prompt = this.buildRankingPrompt(suppliers, rfqData);
                const completion = await this.openAI.getCompletions(
                    aiConfig.config.openAI.deploymentName,
                    [prompt],
                    {
                        temperature: 0.3,
                        maxTokens: 1000
                    }
                );

                const ranking = JSON.parse(completion.choices[0].text);
                return ranking;
            } catch (error) {
                console.error('AI ranking error, falling back to algorithmic ranking:', error);
            }
        }

        // Fallback: Use algorithmic ranking
        return this.algorithmicRanking(suppliers, rfqData);
    }

    algorithmicRanking(suppliers, rfqData) {
        // Enhanced ranking based on multiple factors
        const rankedSuppliers = suppliers.map(supplier => {
            let finalScore = supplier.matchScore || 0;
            const rankingFactors = [];
            
            // Factor 1: Quantity capability
            if (rfqData.quantity && supplier.sampleProducts && supplier.sampleProducts.length > 0) {
                const hasHighVolume = supplier.sampleProducts.some(p => 
                    p.pricing?.tierPricing?.some(tier => tier.minQuantity >= rfqData.quantity * 0.8)
                );
                if (hasHighVolume) {
                    finalScore += 15;
                    rankingFactors.push('Can handle large quantities');
                }
            }
            
            // Factor 2: Delivery time match
            if (rfqData.deliveryDate) {
                const daysToDelivery = Math.ceil((new Date(rfqData.deliveryDate) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysToDelivery >= 7) {
                    finalScore += 10;
                    rankingFactors.push('Adequate lead time');
                } else if (daysToDelivery >= 3) {
                    finalScore += 5;
                    rankingFactors.push('Tight but possible delivery');
                }
            }
            
            // Factor 3: Price competitiveness (if we have pricing data)
            if (rfqData.targetPrice && supplier.sampleProducts && supplier.sampleProducts.length > 0) {
                const avgPrice = supplier.sampleProducts.reduce((sum, p) => sum + (p.pricing?.basePrice || 0), 0) / supplier.sampleProducts.length;
                if (avgPrice > 0) {
                    const priceDiff = Math.abs(avgPrice - rfqData.targetPrice) / rfqData.targetPrice;
                    if (priceDiff < 0.1) {
                        finalScore += 20;
                        rankingFactors.push('Excellent price match');
                    } else if (priceDiff < 0.2) {
                        finalScore += 10;
                        rankingFactors.push('Good price match');
                    }
                }
            }
            
            // Factor 4: Special requirements
            if (rfqData.specialRequirements) {
                const reqText = rfqData.specialRequirements.toLowerCase();
                
                // Check for organic requirements
                if (reqText.includes('organic') && supplier.certifications?.some(c => c.toLowerCase().includes('organic'))) {
                    finalScore += 15;
                    rankingFactors.push('Organic certified');
                }
                
                // Check for kosher/halal
                if ((reqText.includes('kosher') && supplier.certifications?.some(c => c.toLowerCase().includes('kosher'))) ||
                    (reqText.includes('halal') && supplier.certifications?.some(c => c.toLowerCase().includes('halal')))) {
                    finalScore += 15;
                    rankingFactors.push('Special dietary certification');
                }
                
                // Check for sustainability
                if (reqText.includes('sustainable') || reqText.includes('eco')) {
                    if (supplier.certifications?.some(c => 
                        c.toLowerCase().includes('sustainable') || 
                        c.toLowerCase().includes('eco') ||
                        c.toLowerCase().includes('green'))) {
                        finalScore += 10;
                        rankingFactors.push('Sustainability certified');
                    }
                }
            }
            
            // Factor 5: Response time (mock - in real system would check actual response times)
            const mockResponseTime = Math.random() * 24; // Mock 0-24 hours
            if (mockResponseTime < 2) {
                finalScore += 10;
                rankingFactors.push('Very fast response time');
            } else if (mockResponseTime < 6) {
                finalScore += 5;
                rankingFactors.push('Good response time');
            }
            
            return {
                ...supplier,
                finalScore,
                rankingFactors: [...(supplier.matchReasons || []), ...rankingFactors],
                recommendationLevel: this.getRecommendationLevel(finalScore)
            };
        });
        
        // Sort by final score
        return rankedSuppliers.sort((a, b) => b.finalScore - a.finalScore);
    }

    getRecommendationLevel(score) {
        if (score >= 80) return 'Highly Recommended';
        if (score >= 60) return 'Recommended';
        if (score >= 40) return 'Good Match';
        if (score >= 20) return 'Possible Match';
        return 'Low Match';
    }

    buildRankingPrompt(suppliers, rfqData) {
        return `Rank these suppliers for the following RFQ:
RFQ: ${JSON.stringify(rfqData, null, 2)}
Suppliers: ${JSON.stringify(suppliers, null, 2)}

Return a JSON array of suppliers ordered by best match, with match scores and reasons.`;
    }
}

module.exports = new SupplierMatchingService();
