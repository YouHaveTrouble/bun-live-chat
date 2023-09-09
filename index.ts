class Message {
    name: string;
    content: string;

    constructor(name: string, content: string) {
        this.name = name;
        this.content = content;
    }
}

Bun.serve({
    async fetch(req) {
        const url = new URL(req.url);
    

        if (url.pathname === "/") {
            return new Response(Bun.file("./public/index.html"));
        }

        if (url.pathname === "/messages" && req.method === "GET") {
            return sse(req);
        }

        if (url.pathname === "/messages" && req.method === "POST") {
            if (!req.body) return new Response("No body", { status: 400 })
            const body = await req.json();
            if (!body.message) return new Response("No message content", { status: 400 })
            console.debug(`Sending message ${JSON.stringify(body)} to ${Object.values(messageQueues).length} clients`)
            for (const queueId in messageQueues) {
                messageQueues[queueId].push(new Message("Someone", body.message));
            }
            return new Response("OK");
        }

        return new Response("Not found", { status: 404 });
    },
});

const messageQueues = {} as {[key: string]: Array<Message>};

function sse(req: Request): Response {
    const signal = req.signal;
    const id = crypto.randomUUID();
    console.debug("Creating session for", id)
    req.signal.addEventListener("abort", () => {
        console.debug("cancelling stream for", id);
        delete messageQueues[id];
    })
    messageQueues[id] = []
    const stream = new ReadableStream({
        type: "direct",
        async pull(controller: ReadableStreamDirectController) {
          while (!signal.aborted) {
            for (const message of messageQueues[id]) {
                await sendSSEMessage(controller, message);
                await controller.flush();
            }
            messageQueues[id].length = 0;
            await Bun.sleep(100);
          }
          controller.close();
        },
      });
    return new Response(
      stream,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
}

function sendSSEMessage(controller: ReadableStreamDirectController, data: Message) {
  return controller.write(`data:${JSON.stringify(data)}\n\n`);
}