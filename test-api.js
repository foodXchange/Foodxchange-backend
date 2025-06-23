const axios = require("axios");

async function testAPI() {
  try {
    // Test health endpoint
    const health = await axios.get("http://localhost:5000/health");
    console.log("✅ Server health:", health.data);

    // Test products endpoint
    const products = await axios.get("http://localhost:5000/api/products");
    console.log("✅ Products found:", products.data.length || 0);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testAPI();
