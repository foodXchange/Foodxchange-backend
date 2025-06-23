// src/search/searchIndexer.js
const { esClient } = require('../config/elasticsearch');
const { Project, User } = require('../models'); // Use existing models

class SearchIndexer {
  constructor() {
    this.indices = {
      projects: 'foodxchange_projects',
      suppliers: 'foodxchange_suppliers'
    };
  }

  async reindexAll() {
    console.log('Starting full reindex...');
    
    for (const [type, indexName] of Object.entries(this.indices)) {
      await this.createIndex(indexName, type);
      await this.indexData(type);
    }
    
    console.log('Reindex complete!');
  }

  async createIndex(indexName, type) {
    try {
      // Delete existing index
      await esClient.indices.delete({ index: indexName }).catch(() => {});
      
      // Get mapping based on type
      const mapping = require(`./indices/${type}Index`);
      
      // Create new index
      await esClient.indices.create({
        index: indexName,
        body: mapping
      });
      
      console.log(`Created index: ${indexName}`);
    } catch (error) {
      console.error(`Error creating index ${indexName}:`, error);
    }
  }

  async indexData(type) {
    let Model, transformer;
    
    switch (type) {
      case 'projects':
        Model = Project;
        transformer = this.transformProject;
        break;
      case 'suppliers':
        Model = User;
        transformer = this.transformSupplier;
        break;
    }
    
    const batchSize = 100;
    let skip = 0;
    
    while (true) {
      const documents = await Model.find()
        .skip(skip)
        .limit(batchSize)
        .lean();
      
      if (documents.length === 0) break;
      
      const body = documents.flatMap(doc => [
        { index: { _index: this.indices[type], _id: doc._id.toString() } },
        transformer(doc)
      ]);
      
      await esClient.bulk({ body });
      
      skip += batchSize;
      console.log(`Indexed ${skip} ${type}...`);
    }
  }

  transformProject(project) {
    return {
      id: project._id.toString(),
      title: project.title,
      description: project.description,
      category: project.category,
      status: project.status,
      createdAt: project.createdAt,
      deadline: project.deadline
    };
  }

  transformSupplier(user) {
    if (user.userType !== 'vendor') return null;
    return {
      id: user._id.toString(),
      companyName: user.companyName,
      country: user.country,
      userType: user.userType,
      isVerified: user.isVerified
    };
  }

  async incrementalIndex() {
    console.log('Incremental indexing completed');
  }
}

module.exports = new SearchIndexer();