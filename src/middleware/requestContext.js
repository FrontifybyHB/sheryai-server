import { v4 as uuidv4 } from 'uuid';

const requestContext = (req, _res, next) => {
  const role = req.headers['x-demo-role'] || req.query.role || 'student';

  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.user = {
    uid: `open-${role}`,
    email: `${role}@open.sheryai`,
    role,
  };

  next();
};

export default requestContext;
