import txt2imgOptsSchema from "../schemas/txt2imgOpts";
import type { Txt2ImgOpts } from "../schemas/txt2imgOpts";

async function exec(
  opts: Txt2ImgOpts,
  {
    setLog,
    imgResult,
  }: {
    setLog: (log: string[]) => void;
    imgResult: React.MutableRefObject<HTMLImageElement | undefined>;
  }
) {
  let log: string[] = [];
  let up = 0;
  let buffer;
  console.log("start");

  const response = await fetch("/api/txt2img-exec", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelOpts: opts }),
  });

  if (!response.body) throw new Error("No body");
  const reader = response.body.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    try {
      // const str = Buffer.from(value).toString("utf-8");
      const str = String.fromCharCode.apply(null, value);
      const strs = str.trim().split("\n");
      for (const str of strs) {
        const obj = JSON.parse(str);
        if (obj.$type === "stdout" || obj.$type === "stderr") {
          let line = obj.data;
          while (line.endsWith("\u001b[A")) {
            line = line.substr(0, line.length - "\u001b[A".length);
            up++;
          }
          log = log.slice(0, log.length - up).concat([line]);
          up = 0;
          setLog(log);
        } else if (obj.$type === "done") {
          setLog(log.concat(["[WebUI] Loading image..."]));
          const response = await fetch("/api/imgFetchAndDelete?dir=" + obj.dir);
          const blob = await response.blob();
          const objectURL = URL.createObjectURL(blob);
          if (imgResult.current) imgResult.current.src = objectURL;
          setLog([]);
        } else {
          console.log(obj);
        }
      }
    } catch (e) {
      console.error(e);
      console.error(value);
      throw new Error("Invalid JSON");
    }
  }
  console.log("done");
}

async function http(
  opts: Txt2ImgOpts,
  {
    setLog,
    imgResult,
  }: {
    setLog: (log: string[]) => void;
    imgResult: React.MutableRefObject<HTMLImageElement | undefined>;
  }
) {
  setLog(["[WebUI] Sending request..."]);
  const response = await fetch("/api/txt2img-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ modelOpts: opts }),
  });
  const result = await response.json();

  const imgBase64 = result.modelOutputs[0].image_base64;
  const buffer = Buffer.from(imgBase64, "base64");
  const blob = new Blob([buffer], { type: "image/png" });
  const objectURL = URL.createObjectURL(blob);
  if (imgResult.current) imgResult.current.src = objectURL;
  setLog([]);

  // console.log(result);
}

const runners = { exec, http };

export default async function txt2img(
  opts: unknown,
  {
    setLog,
    imgResult,
    dest,
  }: {
    setLog: (log: string[]) => void;
    imgResult: React.MutableRefObject<HTMLImageElement | undefined>;
    dest: "exec" | "http";
  }
) {
  const runner = runners[dest];
  //console.log("runner", dest, runner);
  console.log(opts);
  const modelOpts = txt2imgOptsSchema.cast(opts);
  const result = await runner(modelOpts, { setLog, imgResult });
  return result;
}
