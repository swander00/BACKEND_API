// ===============================================================================================
// AI SERVICE - Property Summary Generation
// ===============================================================================================
// Generates AI-powered summaries for property descriptions using OpenAI
// ===============================================================================================

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openaiClient = null;

/**
 * Initialize OpenAI client if API key is available
 */
function initializeOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  // Log for debugging (without exposing the full key)
  if (apiKey) {
    const maskedKey = apiKey.length > 10 
      ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
      : '***';
    logger.info('OpenAI API key found', { keyPrefix: maskedKey });
  } else {
    logger.warn('OpenAI API key not found in environment variables');
  }
  
  if (!apiKey || apiKey === 'your-openai-api-key-here' || apiKey.trim() === '') {
    logger.warn('OpenAI API key not configured or is placeholder, AI summaries will be disabled', {
      hasKey: !!apiKey,
      isPlaceholder: apiKey === 'your-openai-api-key-here',
      isEmpty: apiKey?.trim() === ''
    });
    return null;
  }

  if (!openaiClient) {
    try {
      openaiClient = new OpenAI({
        apiKey: apiKey
      });
      logger.info('OpenAI client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI client', { error: error.message });
      return null;
    }
  }

  return openaiClient;
}

/**
 * Generate AI summary for a property
 * @param {Object} property - Property details from PropertyView
 * @returns {Promise<Object|null>} AI summary object with {summary, highlights[], confidence} or null if unavailable
 */
export async function generatePropertySummary(property) {
  try {
    logger.debug('Generating AI summary', { listingKey: property?.ListingKey });
    const client = initializeOpenAI();
    
    if (!client) {
      logger.debug('OpenAI client not available, skipping AI summary generation');
      return null;
    }

    // Build context from property data
    const propertyContext = buildPropertyContext(property);
    
    // Create prompt for OpenAI
    const prompt = createSummaryPrompt(propertyContext);

    // Call OpenAI API
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Using cost-effective model
      messages: [
        {
          role: 'system',
          content: 'You are a real estate expert helping potential buyers understand properties. Generate concise, engaging summaries that highlight key features and appeal.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      logger.warn('OpenAI returned empty response', { listingKey: property.ListingKey });
      return null;
    }

    // Parse the response into structured format
    const summary = parseAIResponse(responseText);

    logger.debug('AI summary generated successfully', { 
      listingKey: property.ListingKey,
      hasSummary: !!summary.summary,
      highlightCount: summary.highlights?.length || 0
    });

    return summary;

  } catch (error) {
    // Log error but don't fail the request - gracefully return null
    const statusCode = error.status || error.response?.status || error.statusCode;
    
    // Provide specific error messages for common issues
    if (statusCode === 429) {
      logger.warn('OpenAI API quota exceeded - AI summaries temporarily unavailable', {
        listingKey: property?.ListingKey,
        error: error.message,
        hint: 'Check OpenAI billing and usage limits at https://platform.openai.com/usage'
      });
    } else if (statusCode === 401) {
      logger.error('OpenAI API authentication failed - check API key', {
        listingKey: property?.ListingKey,
        error: error.message
      });
    } else {
      logger.error('Failed to generate AI summary', {
        listingKey: property?.ListingKey,
        error: error.message,
        errorType: error.constructor?.name,
        statusCode: statusCode,
        stack: error.stack
      });
    }
    
    return null;
  }
}

/**
 * Build property context string for AI prompt
 */
function buildPropertyContext(property) {
  const parts = [];

  // Address
  if (property.FullAddress) {
    parts.push(`Address: ${property.FullAddress}`);
  }

  // Property type
  if (property.PropertyType) {
    parts.push(`Property Type: ${property.PropertyType}${property.PropertySubType ? ` - ${property.PropertySubType}` : ''}`);
  }

  // Price
  if (property.ListPrice) {
    parts.push(`List Price: $${property.ListPrice.toLocaleString()}`);
  }

  // Bedrooms and bathrooms
  const bedrooms = (property.BedroomsAboveGrade || 0) + (property.BedroomsBelowGrade || 0);
  if (bedrooms > 0) {
    parts.push(`Bedrooms: ${bedrooms}${property.BedroomsBelowGrade ? ` (${property.BedroomsAboveGrade} above grade, ${property.BedroomsBelowGrade} below)` : ''}`);
  }
  if (property.BathroomsTotalInteger) {
    parts.push(`Bathrooms: ${property.BathroomsTotalInteger}`);
  }

  // Square footage
  if (property.LivingAreaMin || property.LivingAreaMax) {
    if (property.LivingAreaMin === property.LivingAreaMax) {
      parts.push(`Square Footage: ${property.LivingAreaMin} sq ft`);
    } else {
      parts.push(`Square Footage: ${property.LivingAreaMin || property.LivingAreaMax} - ${property.LivingAreaMax || property.LivingAreaMin} sq ft`);
    }
  }

  // Lot size
  if (property.LotSizeAcres) {
    parts.push(`Lot Size: ${property.LotSizeAcres} acres`);
  } else if (property.LotSizeWidth && property.LotSizeDepth) {
    parts.push(`Lot Size: ${property.LotSizeWidth} x ${property.LotSizeDepth} ft`);
  }

  // Age
  if (property.ApproximateAge) {
    parts.push(`Age: ${property.ApproximateAge}`);
  }

  // Architectural style
  if (property.ArchitecturalStyle) {
    parts.push(`Style: ${property.ArchitecturalStyle}`);
  }

  // Basement
  if (property.BasementStatus) {
    parts.push(`Basement: ${property.BasementStatus}`);
  }

  // Parking
  if (property.ParkingTotal) {
    parts.push(`Parking: ${property.ParkingTotal} spaces${property.GarageSpaces ? ` (${property.GarageSpaces} garage)` : ''}`);
  }

  // Key features
  const features = [];
  if (property.InteriorFeatures) features.push(property.InteriorFeatures);
  if (property.ExteriorFeatures) features.push(property.ExteriorFeatures);
  if (property.PoolFeatures) features.push(`Pool: ${property.PoolFeatures}`);
  if (property.WaterfrontYN) features.push('Waterfront property');
  if (property.HasVirtualTour) features.push('Virtual tour available');

  if (features.length > 0) {
    parts.push(`Features: ${features.join(', ')}`);
  }

  // Public remarks (description)
  if (property.PublicRemarks) {
    parts.push(`\nDescription:\n${property.PublicRemarks}`);
  }

  return parts.join('\n');
}

/**
 * Create prompt for OpenAI
 */
function createSummaryPrompt(propertyContext) {
  return `Analyze the following property listing and generate a concise, engaging summary with key highlights.

Property Details:
${propertyContext}

Please provide:
1. A brief summary (2-3 sentences) highlighting what makes this property special
2. 3-5 key highlights as bullet points (e.g., "Spacious 4-bedroom home", "Updated kitchen", "Large backyard")
3. Format your response as JSON:
{
  "summary": "Your summary text here",
  "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
  "confidence": 0.85
}

The confidence score should be between 0 and 1, indicating how confident you are in the summary based on the available information.`;
}

/**
 * Parse AI response into structured format
 */
function parseAIResponse(responseText) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || responseText.split('\n')[0],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8
      };
    }

    // Fallback: if no JSON found, create structure from text
    const lines = responseText.split('\n').filter(line => line.trim());
    const summary = lines[0] || responseText.substring(0, 200);
    const highlights = lines
      .slice(1)
      .filter(line => line.trim().match(/^[-•*]/))
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .slice(0, 5);

    return {
      summary,
      highlights: highlights.length > 0 ? highlights : [],
      confidence: 0.7
    };
  } catch (error) {
    logger.warn('Failed to parse AI response', { error: error.message, responseText });
    // Fallback structure
    return {
      summary: responseText.substring(0, 300),
      highlights: [],
      confidence: 0.6
    };
  }
}

