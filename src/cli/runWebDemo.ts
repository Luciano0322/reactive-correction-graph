import { createCorrectionSessionHttpServer } from "../web/createCorrectionSessionHttpServer.js";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const server = createCorrectionSessionHttpServer();

server.listen(port, host, () => {
  console.log(`Reactive Correction Session running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
