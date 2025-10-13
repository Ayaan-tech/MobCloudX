import express, { Request, Response } from "express";
import responseTime from "response-time"
import client from "prom-client";
const app = express();
const PORT = 3000;

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
    register: client.register,
})

app.get("/metrics", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", client.register.contentType);
  res.send(await client.register.metrics());
});

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});


app.get("/heavy", async (req: Request, res: Response) => {
  try {
    const timeTaken = await getSomeHeavyComputation();
    return res.json({
      status: "success",
      message: `Heavy Task completed in ${timeTaken}ms`,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      status: "error",
      message: "Heavy Task failed",
      error: message,
    });
  }
});
const reqResTime = new client.Histogram({
  name:"http_express_req_res_time",
  help:"Time taken to process the request",
  labelNames:["method","route","status_code"],
  buckets:[0.1,0.5,1,2.5,5,10 , 20 ,50 ,100 ,200 ,500 ,1000 ,2000 ,5000 ,10000]
})

app.use(responseTime((req,res,time)=>{
  reqResTime
  .labels({
    method:req.method,
    route:req.route,
    status_code:res.statusCode
  }).observe(time) 
}))

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});



async function getSomeHeavyComputation(): Promise<number> {
  const ms = getRandomValue([100, 150, 200, 250, 300, 350, 400, 450, 500]);
  const shouldThrowError = getRandomValue([1, 2, 3, 4, 5, 6, 7, 8, 9]) === 8;

  if (shouldThrowError) {
    const randomError = getRandomValue([
      "DB_ERROR",
      "NETWORK_ERROR",
      "TIMEOUT_ERROR",
      "UNKNOWN_ERROR",
    ]);
    throw new Error(randomError);
  }

  return new Promise<number>((resolve) => {
    setTimeout(() => {
      resolve(ms);
    }, ms);
  });
}

function getRandomValue<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}