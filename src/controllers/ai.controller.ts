import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Product } from '../models/Product';
import { RFQ } from '../models/RFQ';
import { OpenAIService } from '../services/azure/openAI.service';
import { ComputerVisionService } from '../services/azure/computerVision.service';
import { DocumentIntelligenceService } from '../services/azure/documentIntelligence.service';
import { AzureStorageService } from '../services/azure/storage.service';

// Initialize services (lazy loading)
let openAIService: OpenAIService;
let visionService: ComputerVisionService;
let documentService: DocumentIntelligenceService;
let storageService: AzureStorageService;

const getServices = () => {
  if (!openAIService) {
    openAIService = new OpenAIService();
    visionService = new ComputerVisionService();
    documentService = new DocumentIntelligenceService();
    storageService = new AzureStorageService();
  }
  return { openAIService, visionService, documentService, storageService };
};

// @desc    Analyze product image with AI
// @route   POST /api/ai/analyze-product-image
// @access  Private
export const analyzeProductImage = async (req: AuthRequest, res: Response) => {
  try {
    const { imageUrl, productId } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    const { visionService, openAIService } = getServices();

    // Analyze image with Computer Vision
    const imageAnalysis = await visionService.analyzeProductImage(imageUrl);
    
    // Generate insights with OpenAI
    const insights = await openAIService.generateProductInsights({
      imageAnalysis,
      productType: req.body.productType || 'food'
    });

    // If productId provided, update the product
    if (productId) {
      await Product.findByIdAndUpdate(productId, {
        $set: {
          'aiAnalysis.imageAnalysis': imageAnalysis,
          'aiAnalysis.insights': insights,
          'aiAnalysis.lastUpdated': new Date()
        }
      });
    }

    res.json({
      success: true,
      data: {
        imageAnalysis,
        insights,
        recommendations: insights.recommendations || []
      }
    });
  } catch (error: any) {
    console.error('Analyze product image error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error analyzing product image'
    });
  }
};

// @desc    Extract data from documents (invoices, certificates)
// @route   POST /api/ai/extract-document
// @access  Private
export const extractDocumentData = async (req: AuthRequest, res: Response) => {
  try {
    const { documentUrl, documentType } = req.body;

    if (!documentUrl) {
      return res.status(400).json({
        success: false,
        error: 'Document URL is required'
      });
    }

    const { documentService } = getServices();

    // Extract data based on document type
    let extractedData;
    switch (documentType) {
      case 'invoice':
        extractedData = await documentService.analyzeInvoice(documentUrl);
        break;
      case 'certificate':
        extractedData = await documentService.extractComplianceCertificate(documentUrl);
        break;
      default:
        extractedData = await documentService.analyzeDocument(documentUrl);
    }

    res.json({
      success: true,
      data: {
        documentType,
        extractedData,
        confidence: extractedData.confidence || 0.95
      }
    });
  } catch (error: any) {
    console.error('Extract document error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error extracting document data'
    });
  }
};

// @desc    Get AI-powered RFQ matches
// @route   POST /api/ai/match-rfq
// @access  Private
export const matchRFQWithProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { rfqId } = req.body;

    // Get RFQ details
    const rfq = await RFQ.findById(rfqId);
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    const { openAIService } = getServices();

    // Get all active products
    const products = await Product.find({ status: 'active' })
      .populate('supplier', 'name company');

    // Use AI to match products with RFQ
    const matches = await openAIService.matchProductsToRFQ(rfq, products);

    // Sort by match score
    const sortedMatches = matches
      .filter(m => m.matchScore > 0.7)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        rfq: {
          id: rfq._id,
          title: rfq.title,
          category: rfq.category
        },
        matches: sortedMatches,
        totalMatches: sortedMatches.length
      }
    });
  } catch (error: any) {
    console.error('Match RFQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error matching RFQ with products'
    });
  }
};

// @desc    Generate smart pricing suggestions
// @route   POST /api/ai/pricing-suggestion
// @access  Private
export const generatePricingSuggestion = async (req: AuthRequest, res: Response) => {
  try {
    const { productName, category, quantity, currentPrice } = req.body;

    const { openAIService } = getServices();

    // Get historical pricing data
    const similarProducts = await Product.find({
      category,
      status: 'active'
    }).select('name price unit');

    // Generate pricing suggestion
    const suggestion = await openAIService.generatePricingSuggestion({
      productName,
      category,
      quantity,
      currentPrice,
      marketData: similarProducts
    });

    res.json({
      success: true,
      data: suggestion
    });
  } catch (error: any) {
    console.error('Pricing suggestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error generating pricing suggestion'
    });
  }
};

// @desc    Analyze compliance documents
// @route   POST /api/ai/check-compliance
// @access  Private
export const checkCompliance = async (req: AuthRequest, res: Response) => {
  try {
    const { documentUrl, productCategory, targetMarket } = req.body;

    const { documentService, openAIService } = getServices();

    // Extract certificate data
    const certificateData = await documentService.extractComplianceCertificate(documentUrl);

    // Check compliance with AI
    const complianceCheck = await openAIService.checkCompliance({
      certificateData,
      productCategory,
      targetMarket
    });

    res.json({
      success: true,
      data: {
        isCompliant: complianceCheck.isCompliant,
        score: complianceCheck.score,
        issues: complianceCheck.issues || [],
        recommendations: complianceCheck.recommendations || [],
        certificateDetails: certificateData
      }
    });
  } catch (error: any) {
    console.error('Compliance check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error checking compliance'
    });
  }
};

// @desc    Generate product description with AI
// @route   POST /api/ai/generate-description
// @access  Private
export const generateProductDescription = async (req: AuthRequest, res: Response) => {
  try {
    const { productName, category, features, targetAudience } = req.body;

    const { openAIService } = getServices();

    const description = await openAIService.generateProductDescription({
      productName,
      category,
      features,
      targetAudience
    });

    res.json({
      success: true,
      data: {
        description: description.description,
        keyPoints: description.keyPoints || [],
        seoKeywords: description.seoKeywords || []
      }
    });
  } catch (error: any) {
    console.error('Generate description error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error generating product description'
    });
  }
};

// @desc    Upload file to Azure Storage
// @route   POST /api/ai/upload
// @access  Private
export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { storageService } = getServices();

    // Upload to Azure Storage
    const uploadResult = await storageService.uploadFile(
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype,
      {
        uploadedBy: req.user?.id || 'unknown',
        entityType: 'order',
        entityId: 'ai-upload'
      }
    );

    res.json({
      success: true,
      data: {
        url: uploadResult.url,
        fileName: uploadResult.blobName,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error: any) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error uploading file'
    });
  }
};