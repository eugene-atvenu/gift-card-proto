import crypto from 'crypto'

export const generateGiftCardCode = () => {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}
