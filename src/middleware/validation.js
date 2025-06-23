// Add at the end of the file
const validateProduct = [
  body('name')
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),
  body('description')
    .notEmpty()
    .withMessage('Product description is required')
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['grains', 'dairy', 'meat', 'seafood', 'produce', 'processed', 'beverages', 'spices', 'oils', 'nuts', 'dried-fruits', 'sweeteners', 'other'])
    .withMessage('Invalid category'),
  body('pricing.basePrice.value')
    .isNumeric()
    .withMessage('Price must be a number')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be greater than 0'),
  body('availability.minimumOrder.value')
    .isNumeric()
    .withMessage('Minimum order must be a number')
    .isFloat({ min: 0.01 })
    .withMessage('Minimum order must be greater than 0')
];

const validateReview = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Review comment cannot exceed 1000 characters')
];

// Export at the bottom with other exports
module.exports = {
  // ... existing exports
  validateProduct,
  validateReview
};