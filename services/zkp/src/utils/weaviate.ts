import weaviate, { WeaviateClient } from 'weaviate-ts-client';

const client: WeaviateClient = weaviate.client({
  scheme: 'http',
  host: process.env.WEAVIATE_HOST || 'localhost:8080',
});

export default client;

export async function initSchema() {
  const schemaConfig = {
    class: 'Document',
    description: 'Stored identity documents for similarity search',
    vectorizer: 'text2vec-transformers',
    moduleConfig: {
      'text2vec-transformers': {
        vectorizeClassName: false,
      },
    },
    properties: [
      {
        name: 'documentId',
        dataType: ['string'],
        description: 'Internal document ID',
      },
      {
        name: 'documentType',
        dataType: ['string'],
        description: 'Type of document (passport, id, etc.)',
      },
      {
        name: 'content',
        dataType: ['text'],
        description: 'Extracted text content for semantic search',
      },
    ],
  };

  try {
    const schema = await client.schema.getter().do();
    const classExists = schema.classes?.some((c) => c.class === 'Document');

    if (!classExists) {
      await client.schema.classCreator().withClass(schemaConfig).do();
      console.log('Weaviate schema initialized');
    }
  } catch (error) {
    console.error('Failed to initialize Weaviate schema:', error);
  }
}
