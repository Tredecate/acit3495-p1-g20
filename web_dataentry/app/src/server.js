const app = require("./app");
const { app: appConfig } = require("./config/env");

app.listen(appConfig.port, () => {
  console.log(`web_dataentry listening on port ${appConfig.port}`);
});
