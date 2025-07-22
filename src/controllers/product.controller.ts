// Export wrapper for ProductController
import { ProductController } from './marketplace/productController';

const productController = new ProductController();

export const getAllProducts = productController.getProducts.bind(productController);
export const getProductById = productController.getProduct.bind(productController);
export const createProduct = productController.createProduct.bind(productController);
export const updateProduct = productController.updateProduct.bind(productController);
export const deleteProduct = productController.deleteProduct.bind(productController);
export const getProductsByCategory = productController.getCategories.bind(productController);
export const getProductsBySupplier = productController.getProducts.bind(productController); // Using getProducts with supplier filter
export const searchProducts = productController.searchProducts.bind(productController);
export const getProductRecommendations = productController.getRecommendations.bind(productController);
export const updateProductInventory = productController.updateInventory.bind(productController);
export const bulkUpdateProducts = productController.updateProduct.bind(productController); // Using updateProduct
export const exportProducts = productController.exportProducts.bind(productController);
export const importProducts = productController.bulkImportProducts.bind(productController);
export const getProducts = productController.getProducts.bind(productController);
export const getProduct = productController.getProduct.bind(productController);
export const getCategories = productController.getCategories.bind(productController);
export const requestSample = productController.requestSample.bind(productController);