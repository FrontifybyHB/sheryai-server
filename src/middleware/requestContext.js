const requestContext = (req, _res, next) => {
  const role = req.headers['x-demo-role'] || req.query.role || 'student';

  req.user = {
    uid: `open-${role}`,
    email: `${role}@open.sheryai`,
    role,
  };

  next();
};

export default requestContext;
