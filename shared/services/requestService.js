// services/requestService.js
function validateRequest(req) {
  if (!req.body || (!req.body.link && !req.body.rawData) || !req.body.role || !req.body.email) {
    return {
      isValid: false,
      error: "Please provide either a link or raw data, an email address, and specify a role (founder or investor)"
    };
  }
  
  if (!['founder', 'investor'].includes(req.body.role)) {
    return {
      isValid: false,
      error: "Invalid role specified. Must be 'founder' or 'investor'"
    };
  }
  
  return { isValid: true };
}

module.exports = { validateRequest };