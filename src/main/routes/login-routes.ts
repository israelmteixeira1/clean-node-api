import { Router } from "express";
import { adaptRoute } from "../adapters/express/express-route-adapter";
import { makeLoginController } from "../factories/controllers/login/login-controller-factory";
import { makeSignupController } from "../factories/controllers/signup/signup-controller-factory";

export default (router: Router): void => {
  const validateStrings = (fields: string[], allowWhitespace: string[] = []) => (req, res, next) => {
    if (!req.body || fields.some(field => typeof req.body[field] !== 'string' || !(allowWhitespace.includes(field) ? req.body[field] : req.body[field].trim()))) {
      res.status(400).json({ error: 'Invalid request fields' }); return
    }
    next()
  }
  router.post('/signup', validateStrings(['name', 'email', 'password', 'passwordConfirmation']), adaptRoute(makeSignupController()))
  router.post('/login', validateStrings(['email', 'password'], ['password']), adaptRoute(makeLoginController()))
}