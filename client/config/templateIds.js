// Optional local fallback. Production reads the same keys from
// cloud database config/templateIds or cloud function environment variables.
const TEMPLATE_IDS = {
  ORDER_ACCEPT: '',
  ORDER_PAY: '',
  ORDER_COMPLETE: '',
  CHAT_MESSAGE: ''
}

module.exports = TEMPLATE_IDS
