import { SearchClient, SearchIndexClient, SearchIndexerClient, AzureKeyCredential } from '@azure/search-documents';

import { ValidationError } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { IProduct } from '../../models/Product';

const logger = new Logger('AzureSearchService');

export interface SearchResult {
  id: string;
  score: number;
  product: Partial<IProduct>;
  highlights?: {
    [field: string]: string[];
  };
}

export interface SearchFilters {
  category?: string[];
  supplier?: string[];
  brand?: string[];
  priceRange?: {
    min?: number;
    max?: number;
  };
  allergens?: string[];
  dietary?: string[];
  certifications?: string[];
  inStock?: boolean;
  tenantId: string;
}

export interface SearchOptions {
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'name' | 'date';
  filters?: SearchFilters;
  facets?: string[];
  highlight?: boolean;
  fuzzy?: boolean;
}

export class AzureSearchService {
  private readonly searchClient: SearchClient<any>;
  private readonly indexClient: SearchIndexClient;
  private readonly indexerClient: SearchIndexerClient;
  private readonly indexName: string;
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor() {
    this.endpoint = process.env.AZURE_SEARCH_ENDPOINT || '';
    this.apiKey = process.env.AZURE_SEARCH_API_KEY || '';
    this.indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'products';

    if (!this.endpoint || !this.apiKey) {
      logger.warn('Azure Search credentials not configured');
      return;
    }

    const credential = new AzureKeyCredential(this.apiKey);

    this.searchClient = new SearchClient(
      this.endpoint,
      this.indexName,
      credential
    );

    this.indexClient = new SearchIndexClient(this.endpoint, credential);
    this.indexerClient = new SearchIndexerClient(this.endpoint, credential);
  }

  /**
   * Initialize the search index
   */
  async initializeIndex(): Promise<void> {
    try {
      const indexDefinition = {
        name: this.indexName,
        fields: [
          { name: 'id', type: 'Edm.String', key: true, searchable: false },
          { name: 'tenantId', type: 'Edm.String', filterable: true },
          { name: 'name', type: 'Edm.String', searchable: true, analyzer: 'standard.lucene' },
          { name: 'description', type: 'Edm.String', searchable: true, analyzer: 'standard.lucene' },
          { name: 'shortDescription', type: 'Edm.String', searchable: true },
          { name: 'sku', type: 'Edm.String', searchable: true, filterable: true },
          { name: 'gtin', type: 'Edm.String', searchable: true, filterable: true },
          { name: 'category', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'subcategory', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'tags', type: 'Collection(Edm.String)', searchable: true, filterable: true },
          { name: 'brand', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'manufacturer', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'supplier', type: 'Edm.String', filterable: true },
          { name: 'supplierName', type: 'Edm.String', searchable: true, filterable: true },
          { name: 'countryOfOrigin', type: 'Edm.String', filterable: true, facetable: true },
          { name: 'price', type: 'Edm.Double', filterable: true, sortable: true },
          { name: 'currency', type: 'Edm.String', filterable: true },
          { name: 'unit', type: 'Edm.String', filterable: true },
          { name: 'inStock', type: 'Edm.Boolean', filterable: true },
          { name: 'availableQuantity', type: 'Edm.Int32', filterable: true },
          { name: 'allergens', type: 'Collection(Edm.String)', filterable: true, facetable: true },
          { name: 'isOrganic', type: 'Edm.Boolean', filterable: true },
          { name: 'isKosher', type: 'Edm.Boolean', filterable: true },
          { name: 'isHalal', type: 'Edm.Boolean', filterable: true },
          { name: 'isVegan', type: 'Edm.Boolean', filterable: true },
          { name: 'isGlutenFree', type: 'Edm.Boolean', filterable: true },
          { name: 'certifications', type: 'Collection(Edm.String)', filterable: true },
          { name: 'keywords', type: 'Collection(Edm.String)', searchable: true },
          { name: 'features', type: 'Collection(Edm.String)', searchable: true },
          { name: 'status', type: 'Edm.String', filterable: true },
          { name: 'isPublished', type: 'Edm.Boolean', filterable: true },
          { name: 'createdAt', type: 'Edm.DateTimeOffset', filterable: true, sortable: true },
          { name: 'updatedAt', type: 'Edm.DateTimeOffset', filterable: true, sortable: true },
          { name: 'imageUrl', type: 'Edm.String' },
          { name: 'rating', type: 'Edm.Double', filterable: true, sortable: true },
          { name: 'reviewCount', type: 'Edm.Int32', filterable: true }
        ],
        suggesters: [
          {
            name: 'sg',
            searchMode: 'analyzingInfixMatching',
            sourceFields: ['name', 'brand', 'category', 'tags']
          }
        ],
        scoringProfiles: [
          {
            name: 'productBoost',
            text: {
              weights: {
                name: 3.0,
                description: 1.5,
                tags: 2.0,
                keywords: 2.5
              }
            },
            functions: [
              {
                type: 'magnitude',
                fieldName: 'rating',
                boost: 2.0,
                interpolation: 'linear',
                magnitude: {
                  boostingRangeStart: 0,
                  boostingRangeEnd: 5
                }
              },
              {
                type: 'freshness',
                fieldName: 'updatedAt',
                boost: 1.5,
                interpolation: 'quadratic',
                freshness: {
                  boostingDuration: 'P30D' // 30 days
                }
              }
            ]
          }
        ],
        defaultScoringProfile: 'productBoost'
      };

      await this.indexClient.createOrUpdateIndex(indexDefinition);
      logger.info('Azure Search index initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize search index:', error);
      throw error;
    }
  }

  /**
   * Index a product
   */
  async indexProduct(product: IProduct): Promise<void> {
    try {
      const document = this.transformProductForIndex(product);
      await this.searchClient.uploadDocuments([document]);

      logger.debug('Product indexed successfully', {
        productId: product._id,
        sku: product.sku
      });
    } catch (error) {
      logger.error('Failed to index product:', error);
      throw error;
    }
  }

  /**
   * Index multiple products
   */
  async indexProducts(products: IProduct[]): Promise<void> {
    try {
      const documents = products.map(p => this.transformProductForIndex(p));
      const result = await this.searchClient.uploadDocuments(documents);

      logger.info(`Indexed ${result.results.length} products successfully`);
    } catch (error) {
      logger.error('Failed to index products:', error);
      throw error;
    }
  }

  /**
   * Remove product from index
   */
  async removeProduct(productId: string): Promise<void> {
    try {
      await this.searchClient.deleteDocuments([{ id: productId }]);
      logger.debug('Product removed from index', { productId });
    } catch (error) {
      logger.error('Failed to remove product from index:', error);
      throw error;
    }
  }

  /**
   * Search products
   */
  async searchProducts(
    query: string,
    options: SearchOptions
  ): Promise<{
    results: SearchResult[];
    totalCount: number;
    facets?: any;
    suggestions?: string[];
  }> {
    try {
      if (!this.searchClient) {
        throw new ValidationError('Search service not configured');
      }

      const searchOptions: any = {
        includeTotalCount: true,
        skip: ((options.page || 1) - 1) * (options.pageSize || 20),
        top: options.pageSize || 20,
        searchMode: 'all',
        queryType: 'full'
      };

      // Build filters
      const filters: string[] = [];

      // Always filter by tenant
      if (options.filters?.tenantId) {
        filters.push(`tenantId eq '${options.filters.tenantId}'`);
      }

      // Only show published products
      filters.push('isPublished eq true');
      filters.push('status eq \'active\'');

      if (options.filters) {
        const {
          category,
          supplier,
          brand,
          priceRange,
          allergens,
          dietary,
          certifications,
          inStock
        } = options.filters;

        if (category && category.length > 0) {
          filters.push(`(${category.map(c => `category eq '${c}'`).join(' or ')})`);
        }

        if (supplier && supplier.length > 0) {
          filters.push(`(${supplier.map(s => `supplier eq '${s}'`).join(' or ')})`);
        }

        if (brand && brand.length > 0) {
          filters.push(`(${brand.map(b => `brand eq '${b}'`).join(' or ')})`);
        }

        if (priceRange) {
          if (priceRange.min !== undefined) {
            filters.push(`price ge ${priceRange.min}`);
          }
          if (priceRange.max !== undefined) {
            filters.push(`price le ${priceRange.max}`);
          }
        }

        if (allergens && allergens.length > 0) {
          // Exclude products with specified allergens
          allergens.forEach(allergen => {
            filters.push(`not (allergens/any(a: a eq '${allergen}'))`);
          });
        }

        if (dietary && dietary.length > 0) {
          dietary.forEach(diet => {
            switch (diet) {
              case 'organic':
                filters.push('isOrganic eq true');
                break;
              case 'kosher':
                filters.push('isKosher eq true');
                break;
              case 'halal':
                filters.push('isHalal eq true');
                break;
              case 'vegan':
                filters.push('isVegan eq true');
                break;
              case 'gluten-free':
                filters.push('isGlutenFree eq true');
                break;
            }
          });
        }

        if (certifications && certifications.length > 0) {
          filters.push(`(${certifications.map(c =>
            `certifications/any(cert: cert eq '${c}')`
          ).join(' or ')})`);
        }

        if (inStock !== undefined) {
          filters.push(`inStock eq ${inStock}`);
        }
      }

      if (filters.length > 0) {
        searchOptions.filter = filters.join(' and ');
      }

      // Sorting
      switch (options.sortBy) {
        case 'price_asc':
          searchOptions.orderBy = ['price asc'];
          break;
        case 'price_desc':
          searchOptions.orderBy = ['price desc'];
          break;
        case 'name':
          searchOptions.orderBy = ['name asc'];
          break;
        case 'date':
          searchOptions.orderBy = ['createdAt desc'];
          break;
        // 'relevance' is default, no orderBy needed
      }

      // Facets
      if (options.facets) {
        searchOptions.facets = options.facets;
      } else {
        // Default facets
        searchOptions.facets = [
          'category',
          'brand',
          'allergens',
          'countryOfOrigin',
          'certifications'
        ];
      }

      // Highlighting
      if (options.highlight) {
        searchOptions.highlightFields = ['name', 'description', 'tags'].join(',');
        searchOptions.highlightPreTag = '<mark>';
        searchOptions.highlightPostTag = '</mark>';
      }

      // Fuzzy search
      if (options.fuzzy && query) {
        // Add fuzzy operator to each term
        query = query.split(' ').map(term => `${term}~`).join(' ');
      }

      // Execute search
      const searchResults = await this.searchClient.search(query || '*', searchOptions);

      const results: SearchResult[] = [];
      const totalCount = 0;

      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          score: result.score || 0,
          product: this.transformIndexToProduct(result.document),
          highlights: result.highlights
        });
      }

      // Get suggestions if query provided
      let suggestions: string[] = [];
      if (query && query.length >= 3) {
        const suggestionResults = await this.searchClient.suggest(query, 'sg', {
          top: 5,
          filter: searchOptions.filter
        });

        suggestions = suggestionResults.results.map(s => s.text);
      }

      return {
        results,
        totalCount: searchResults.count || 0,
        facets: searchResults.facets,
        suggestions
      };
    } catch (error) {
      logger.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Autocomplete search
   */
  async autocomplete(
    query: string,
    tenantId: string,
    maxSuggestions: number = 10
  ): Promise<string[]> {
    try {
      if (!this.searchClient || query.length < 2) {
        return [];
      }

      const filter = `tenantId eq '${tenantId}' and isPublished eq true and status eq 'active'`;

      const results = await this.searchClient.suggest(query, 'sg', {
        top: maxSuggestions,
        filter,
        searchFields: ['name', 'brand', 'tags']
      });

      return results.results.map(r => r.text);
    } catch (error) {
      logger.error('Autocomplete failed:', error);
      return [];
    }
  }

  /**
   * Get similar products
   */
  async getSimilarProducts(
    productId: string,
    tenantId: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      // First, get the product
      const product = await this.searchClient.getDocument(productId);

      if (!product) {
        return [];
      }

      // Search for similar products based on category, tags, and features
      const searchTerms = [
        product.category,
        ...(product.tags || []),
        ...(product.features || [])
      ].filter(Boolean).join(' ');

      const filter = `tenantId eq '${tenantId}' and id ne '${productId}' and isPublished eq true and status eq 'active'`;

      const searchResults = await this.searchClient.search(searchTerms, {
        top: limit,
        filter,
        searchMode: 'any',
        scoringProfile: 'productBoost'
      });

      const results: SearchResult[] = [];

      for await (const result of searchResults.results) {
        results.push({
          id: result.document.id,
          score: result.score || 0,
          product: this.transformIndexToProduct(result.document)
        });
      }

      return results;
    } catch (error) {
      logger.error('Failed to get similar products:', error);
      return [];
    }
  }

  /**
   * Transform product for indexing
   */
  private transformProductForIndex(product: IProduct): any {
    const primaryImage = product.images.find(img => img.isPrimary);

    return {
      id: product._id.toString(),
      tenantId: product.tenantId,
      name: product.name,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      gtin: product.gtin,
      category: product.category,
      subcategory: product.subcategory,
      tags: product.tags,
      brand: product.brand,
      manufacturer: product.manufacturer,
      supplier: product.supplier.toString(),
      supplierName: '', // Would need to populate
      countryOfOrigin: product.countryOfOrigin,
      price: product.pricing.basePrice,
      currency: product.pricing.currency,
      unit: product.pricing.unit,
      inStock: product.inventory.availableQuantity > 0,
      availableQuantity: product.inventory.availableQuantity,
      allergens: product.foodSafety.allergens,
      isOrganic: product.foodSafety.isOrganic,
      isKosher: product.foodSafety.isKosher,
      isHalal: product.foodSafety.isHalal,
      isVegan: product.foodSafety.isVegan,
      isGlutenFree: product.foodSafety.isGlutenFree,
      certifications: product.certifications.map(c => c.type),
      keywords: product.marketing.keywords,
      features: product.marketing.features,
      status: product.status,
      isPublished: product.isPublished,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      imageUrl: primaryImage?.url,
      rating: product.analytics.averageRating,
      reviewCount: product.analytics.totalReviews
    };
  }

  /**
   * Transform index document back to product
   */
  private transformIndexToProduct(document: any): Partial<IProduct> {
    return {
      _id: document.id,
      name: document.name,
      description: document.description,
      shortDescription: document.shortDescription,
      sku: document.sku,
      gtin: document.gtin,
      category: document.category,
      subcategory: document.subcategory,
      tags: document.tags,
      brand: document.brand,
      manufacturer: document.manufacturer,
      countryOfOrigin: document.countryOfOrigin,
      pricing: {
        basePrice: document.price,
        currency: document.currency,
        unit: document.unit
      } as any,
      inventory: {
        availableQuantity: document.availableQuantity
      } as any,
      foodSafety: {
        allergens: document.allergens,
        isOrganic: document.isOrganic,
        isKosher: document.isKosher,
        isHalal: document.isHalal,
        isVegan: document.isVegan,
        isGlutenFree: document.isGlutenFree
      } as any,
      images: document.imageUrl ? [{
        url: document.imageUrl,
        isPrimary: true
      }] as any : [],
      analytics: {
        averageRating: document.rating,
        totalReviews: document.reviewCount
      } as any
    };
  }
}

export default AzureSearchService;
