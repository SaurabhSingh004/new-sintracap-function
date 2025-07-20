// services/openaiService.js
const axios = require('axios');

const SYSTEM_PROMPTS = {
  founder: "You are a smart assistant bot. You will be provided with a block of unstructured website content. Your task is to extract only the following founder-related company profile fields. If you find a value for a field, populate it. If you do not find a value, set it to an empty string '', an empty array [], or null (for numeric fields). Return only the JSON object—no extra keys or commentary. Required JSON response schema (always return valid JSON): {'companyName': '','description': '','industry': '','sector': '','foundedDate': '','fundingStage': '','teamSize': '','fundingRaised': {'amount': null,'currency': 'USD','rounds': [{'roundType': '','amount': null,'date': '','leadInvestor': ''}]},'website': '','phone': '','address': '','role': 'founder','financials': [{'year': null,'revenue': null,'profit': null,'burnRate': null,'valuation': null}]}",
  
  investor: `You are a smart assistant bot. You will be provided with a block of unstructured website content. Your task is to extract only the following investor-related profile fields. If you find a value for a field, populate it. If you do not find a value, set it to an empty string '', an empty array [], or null (for numeric fields). 

IMPORTANT: For previousInvestments, each investment MUST follow the exact schema with ALL fields. If you can't find all required fields for an investment, it's better to leave previousInvestments as an empty array [].

Return only the JSON object—no extra keys or commentary. Required JSON response schema (always return valid JSON): 
{
  'fullName': '',
  'photoURL': '',
  'email': '',
  'phone': '',
  'linkedIn': '',
  'company': '',
  'designation': '',
  'bio': '',
  'location': '',
  'investmentInterests': [],
  'amountRange': '',
  'role': 'investor',
  'previousInvestments': [
    {
      'companyName': '',
      'industry': '',
      'stage': '',
      'amountInvested': null,
      'year': null,
      'status': 'Active',
      'website': '',
      'logoURL': ''
    }
  ],
  'notableExits': []
}`
};

function validateInvestments(investments) {
  if (typeof investments === 'string' || !Array.isArray(investments)) return [];
  
  return investments
    .filter(investment => 
      investment && 
      typeof investment === 'object' &&
      'companyName' in investment &&
      'industry' in investment &&
      'stage' in investment
    )
    .map(investment => ({
      companyName: investment.companyName || '',
      industry: investment.industry || '',
      stage: investment.stage || '',
      amountInvested: investment.amountInvested || null,
      year: investment.year || null,
      status: investment.status || 'Active',
      website: investment.website || '',
      logoURL: investment.logoURL || ''
    }));
}

async function processContent(content, role) {
  if (!['founder', 'investor'].includes(role)) {
    throw new Error("Invalid role specified. Must be 'founder' or 'investor'");
  }

  try {
    const response = await axios.post(
      'https://generic-gpt-40-mini.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview',
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[role] },
          { role: "user", content: content }
        ],
        max_tokens: 4098,
        temperature: 0.4,
        top_p: 0.66,
        frequency_penalty: 0,
        presence_penalty: 0
      },
      {
        headers: {
          'api-key': process.env.OPENAI_API_KEY || '3JN3Z5F5zRDcjw0TMqxa6Zpj3huhFAK4M0R6Fwn8ODz0NcRpaQFpJQQJ99BEACYeBjFXJ3w3AAABACOGZnwM',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("Invalid response from OpenAI API");
    }
    
    const responseContent = response.data.choices[0].message.content;
    
    try {
      const jsonResponse = JSON.parse(responseContent);
      
      // Validate previousInvestments for investor role
      if (role === 'investor' && jsonResponse.previousInvestments) {
        jsonResponse.previousInvestments = validateInvestments(jsonResponse.previousInvestments);
      }
      
      return jsonResponse;
    } catch (parseError) {
      return { rawResponse: responseContent, error: "Failed to parse response as JSON" };
    }
  } catch (error) {
    console.error(`Error processing with OpenAI: ${error.message}`);
    throw new Error(`OpenAI processing failed: ${error.message}`);
  }
}

module.exports = { processContent };    