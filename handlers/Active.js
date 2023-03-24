module.exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      result: "Hello"
    })
  };
};