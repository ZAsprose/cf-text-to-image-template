export default {
  async fetch(request, env) {
    // 1. Authenticate
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    try {
      const { prompt, model } = await request.json();
      if (!prompt) return new Response("Missing prompt", { status: 400 });

      const targetModel = model || "@cf/black-forest-labs/flux-1-schnell";

      // 2. High-quality Translation & Enhancement
      const translation = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { 
            role: "system", 
            content: "You are a professional image prompt engineer. Translate Chinese to a detailed English image prompt. Return ONLY the translation." 
          },
          { role: "user", content: prompt }
        ]
      });
      const englishPrompt = translation.response;

      // 3. Handle Model-Specific Input Formats
      let aiResponse;
      
      // Check if the model is from the Flux.2 family (requires multipart/form-data)
      if (targetModel.includes("flux-2")) {
        const formData = new FormData();
        formData.append("prompt", englishPrompt);

        // Optional: Flux.2 Klein supports aspect_ratio (e.g., "1:1", "16:9")
        formData.append("aspect_ratio", "16:9"); 
        
        aiResponse = await env.AI.run(targetModel, formData);
      } else {
        // Standard models (Flux.1, Stable Diffusion) use JSON
        aiResponse = await env.AI.run(targetModel, { prompt: englishPrompt });
      }

      // 4. Handle Output Formats
      // 3. Handle the Response (Flux.2 returns a JSON with an 'image' key)
      if (aiResponse.image) {
        const binaryString = atob(aiResponse.image);
        const img = Uint8Array.from(binaryString, (m) => m.charCodeAt(0));
        return new Response(img, { headers: { "content-type": "image/png" } });
      }

      // Fallback for streaming binary models
      return new Response(aiResponse, { headers: { "content-type": "image/png" } });

    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }
};
