require("dotenv").config();
const mongoose = require("mongoose");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

// Fix the relative paths
const Company = require("../src/models/Company");
const Product = require("../src/models/Product");
const User = require("../src/models/User");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

async function importSuppliers(filePath) {
  const suppliers = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const supplier = {
          companyType: "supplier",
          companyName: row["Company Name"] || row["Supplier Name"],
          email: row["Company Email"] || "noemail@example.com",
          phone: row["Phone"] || "",
          website: row["Company website"] || "",
          address: {
            street: row["Address"] || "",
            country: row["Supplier''s Country"] || row["Supplier Country"] || "Unknown"
          },
          supplierData: {
            categories: row["Categories"] ? row["Categories"].split(",").map(c => c.trim()) : [],
            preferredSeaport: row["Closest/ Prefered SeaPort"] || "",
            incoterms: row["Incoterms"] || "",
            paymentTerms: row["Terms of Payment"] || "",
            certifications: {
              kosher: row["Kosher certification"] === "Yes",
              kosherType: row["Kosher Type"] || ""
            },
            vatNumber: row["Supplier''s VAT number"] || "",
            supplierNumber: row["Supplier Code"] || ""
          },
          description: cleanDescription(row["Supplier''s Description & Products"] || ""),
          status: "active"
        };
        suppliers.push(supplier);
      })
      .on("end", () => {
        console.log(`Read ${suppliers.length} suppliers from CSV`);
        resolve(suppliers);
      })
      .on("error", reject);
  });
}

function cleanDescription(desc) {
  if (!desc) return "";
  // Remove duplicate sentences
  const sentences = desc.split(".");
  const uniqueSentences = [...new Set(sentences)];
  return uniqueSentences.join(".").substring(0, 2000);
}

async function importData() {
  await connectDB();

  try {
    // Import suppliers
    console.log("Importing suppliers...");
    const suppliersData = await importSuppliers("../data/Suppliers 22_6_2025.csv");

    // Import first 100 suppliers as a test
    const testSuppliers = suppliersData.slice(0, 100);

    for (const supplierData of testSuppliers) {
      try {
        const supplier = await Company.create(supplierData);
        console.log(`Created supplier: ${supplier.companyName}`);

        // Create a default user for the supplier
        await User.create({
          email: supplierData.email,
          password: "TempPassword123!",
          firstName: "Default",
          lastName: "User",
          userType: "supplier",
          company: supplier._id
        });
      } catch (error) {
        console.error(`Error creating supplier: ${error.message}`);
      }
    }

    console.log("Import completed!");
  } catch (error) {
    console.error("Import error:", error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  importData();
}

module.exports = { importSuppliers, importData };
