export default {
  async fetch(request, env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (request.method !== "POST") return new Response("Use POST", { status: 405 });

    try {
      const { prompt, model } = await request.json();
      const targetModel = model || "@cf/black-forest-labs/flux-1-schnell";

      // 1. Translation (Meta Llama 3.1)
      const translation = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "Translate to a detailed English image prompt. Return ONLY the translation." },
          { role: "user", content: prompt }
        ]
      });
      const englishPrompt = translation.response;

      // 2. AI Inference
      let aiResponse;
      if (targetModel.includes("flux-2")) {
        const formData = new FormData();
        formData.append('prompt', englishPrompt);
        formData.append('width', '1024');
        formData.append('height', '1024');
        const formResponse = new Response(formData);
        const formStream = formResponse.body;
        const formContentType = formResponse.headers.get('content-type');
        aiResponse = await env.AI.run(targetModel, { multipart: {
        body: formStream,
        contentType: formContentType
      }});
      } else {
        aiResponse = await env.AI.run(targetModel, { prompt: englishPrompt });
      }

      // 3. Handle different response types to prevent the ReadableStream error
      
      // Check if it's a JSON object (Flux models often return { image: "base64..." })
      if (aiResponse && typeof aiResponse === 'object' && aiResponse.image) {
        const binaryString = atob(aiResponse.image);
        const img = Uint8Array.from(binaryString, (m) => m.charCodeAt(0));
        return new Response(img, { headers: { "Content-Type": "image/png" } });
      }

      // THE ULTIMATE FIX: 
      // If it's a stream, we "consume" it into an ArrayBuffer.
      // This converts the 'ReadableStream' into fixed binary data.
      const blob = await new Response(aiResponse).arrayBuffer();
      
      return new Response(blob, {
        headers: { 
          "Content-Type": "image/png",
          "x-model-used": targetModel
        }
      });

    } catch (e) {
      // If it's a 5006 error, the model might not support the format we chose
      return new Response(`Worker Error: ${e.message}`, { status: 500 });
    }
  }
};
