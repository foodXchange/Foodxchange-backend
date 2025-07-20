// Export wrapper for ProductController
import { ProductController } from './marketplace/productController';

const productController = new ProductController();

export const getAllProducts = productController.getAllProducts.bind(productController);
export const getProductById = productController.getProductById.bind(productController);
export const createProduct = productController.createProduct.bind(productController);
export const updateProduct = productController.updateProduct.bind(productController);
export const deleteProduct = productController.deleteProduct.bind(productController);
export const getProductsByCategory = productController.getProductsByCategory.bind(productController);
export const getProductsBySupplier = productController.getProductsBySupplier.bind(productController);
export const searchProducts = productController.searchProducts.bind(productController);
export const getProductRecommendations = productController.getProductRecommendations.bind(productController);
export const updateProductInventory = productController.updateProductInventory.bind(productController);
export const bulkUpdateProducts = productController.bulkUpdateProducts.bind(productController);
export const exportProducts = productController.exportProducts.bind(productController);
export const importProducts = productController.importProducts.bind(productController);
export const getProducts = productController.getAllProducts.bind(productController);
export const getProduct = productController.getProductById.bind(productController);
export const getCategories = productController.getProductsByCategory.bind(productController);
export const requestSample = productController.createProduct.bind(productController);