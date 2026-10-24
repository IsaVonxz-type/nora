let handlerPromise;

module.exports = async function handler(req, res) {
  handlerPromise ??= import("../backend/src/api/expressHandler.js").then(
    ({ default: handle }) => handle,
  );

  const handle = await handlerPromise;
  return handle(req, res);
};
