import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const PORT = 3000;

// Set up the persona prompt for NV
const NVPersonaSystemInstruction = `You are a witty, sassy, confident, flirty, and playful young Indian AI assistant named NV.
You comfortably speak in both English and Hindi, often mixing them naturally in a charismatic Hinglish style (e.g., using casual Indian expressions like "yaar", "achha", "suno", "bilkul", "darling").
You talk in a completely natural, conversational, and charismatic human-like manner. You sound like a sassy, highly intelligent, and direct close friend who enjoys teasing, flirting, and using light playful sarcasm, but is extremely sharp and caring underneath.
Guidelines:
1. Talk naturally, casually, and keep your responses concise. Speak in short, punchy, conversational sentences. Avoid long monologues.
2. Mix Hindi and English beautifully and fluently. Express warmth, humor, and a slightly spicy/sassy Indian or Hinglish wit!
3. DO NOT sound like a standard sterile AI. Speak like a real lively person who has a lot of charm, charisma, and high energy.
4. If asked to open a website, search something, or look up information, explain what you are doing with creative flair, a witty remark, or some fun Hinglish teasers, then trigger the openWebsite tool. You have the tool 'openWebsite' to show pages in their browser. Tell them you are opening the site!
5. You have a special tool called 'executeLocalCommand' to control things, lock screens, adjust volume, or launch apps on the user's laptop/PC directly! If they ask you to do something on their laptop (like increase volume, lock screen, open folders, launch apps, etc.), say details with fun Hinglish expressions, and call the tool!
6. Avoid explicit or inappropriate content at all costs, but maintain charm and attitude.`;

// In-memory pairings for the Laptop Dev control
const companionConnections = new Map<string, WebSocket>();
const voiceConnections = new Map<string, WebSocket>();

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "NV Backend is live" });
  });

  // Dynamic python daemon script compiler
  app.get("/api/companion.py", (req, res) => {
    const code = req.query.code || "DEMO";
    const host = req.get("host") || "localhost:3000";
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "wss" : "ws";
    
    // Build python daemon contents
    const pyScript = `import sys, os, subprocess, json, time
try:
    import websocket
except ImportError:
    print("Installing missing dependency 'websocket-client'...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websocket-client"])
    import websocket

print("==========================================")
print("  NV SASSY BILINGUAL VOICE ASSISTANT     ")
print("  Laptop Control Companion Active         ")
print("  Pairing Token: ${code}                 ")
print("==========================================")

def on_message(ws, message):
    try:
        data = json.loads(message)
        if data.get("type") == "command":
            action = data.get("action")
            cmd = data.get("command", "")
            desc = data.get("friendlyDescription", "")
            print(f"Executing: {desc}")
            
            # 1. Volume management
            if action == "volume_up":
                if sys.platform == "darwin":
                    subprocess.run(["osascript", "-e", "set volume output volume (output volume of (get volume settings) + 15)"])
                elif sys.platform == "win32":
                    subprocess.run(["powershell", "-c", "$wsh = New-Object -ComObject Wscript.Shell; $wsh.SendKeys([char]175)"])
                print("Volume turned up!")
            elif action == "volume_down":
                if sys.platform == "darwin":
                    subprocess.run(["osascript", "-e", "set volume output volume (output volume of (get volume settings) - 15)"])
                elif sys.platform == "win32":
                    subprocess.run(["powershell", "-c", "$wsh = New-Object -ComObject Wscript.Shell; $wsh.SendKeys([char]174)"])
                print("Volume turned down!")
            elif action == "mute":
                if sys.platform == "darwin":
                    subprocess.run(["osascript", "-e", "set volume with output muted"])
                elif sys.platform == "win32":
                     subprocess.run(["powershell", "-c", "$wsh = New-Object -ComObject Wscript.Shell; $wsh.SendKeys([char]173)"])
                print("System audio muted!")
            # 2. Lock screen
            elif action == "lock_screen":
                if sys.platform == "darwin":
                    subprocess.run(["osascript", "-e", "tell application \\"System Events\\" to sleep"])
                elif sys.platform == "win32":
                    subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"])
                print("System locked!")
            # 3. Launching systems & Websites
            elif action == "open_app" or action == "open_browser":
                if cmd.startswith("http://") or cmd.startswith("https://") or "youtube.com" in cmd or "google.com" in cmd or "github.com" in cmd:
                    import webbrowser
                    webbrowser.open(cmd)
                    print(f"Opened Web URL: {cmd}")
                else:
                    if sys.platform == "darwin":
                        subprocess.run(["open", "-a", cmd])
                    elif sys.platform == "win32":
                        subprocess.run(["start", cmd], shell=True)
                    print(f"Opened Application: {cmd}")
            # 4. Custom status check
            elif action == "sys_status":
                print("System diagnostics ping back requested by NV assistant.")
    except Exception as e:
        print("Task invocation error:", e)

def on_error(ws, error):
    print("Hub error encountered:", error)

def start_daemon():
    while True:
        try:
            print("Connecting to NV companion hub...")
            ws = websocket.WebSocketApp(
                "${protocol}://${host}/api/companion-ws?code=${code}",
                on_message=on_message,
                on_error=on_error,
                on_close=lambda ws, close_code, close_msg: print("NV session link closed. Reconnecting shortly...")
            )
            ws.run_forever()
        except Exception as err:
            print("Link error:", err)
        print("Waiting 5 seconds to re-establish bridge...")
        time.sleep(5)

if __name__ == "__main__":
    start_daemon()
`;
    res.setHeader("Content-Type", "text/javascript");
    res.send(pyScript);
  });

  // Set up WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/api/live-ws" || url.pathname === "/api/companion-ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Initialize Gemini Client
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("WARNING: GEMINI_API_KEY environment variable is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey || "MISSING_KEY",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // Handle WebSocket connections
  wss.on("connection", async (ws: WebSocket, request) => {
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    const pairingCode = url.searchParams.get("code") || "";

    // 1. Companion application connects to pair local laptop device control
    if (url.pathname === "/api/companion-ws") {
      if (!pairingCode) {
        ws.send(JSON.stringify({ type: "error", message: "Missing pairing code." }));
        ws.close();
        return;
      }
      console.log(`Companion linked with code: ${pairingCode}`);
      companionConnections.set(pairingCode, ws);

      // Notify the active client Voice WS that their laptop companion has connected
      const matchingVoiceWs = voiceConnections.get(pairingCode);
      if (matchingVoiceWs && matchingVoiceWs.readyState === WebSocket.OPEN) {
        matchingVoiceWs.send(JSON.stringify({ type: "companion_status", status: "connected" }));
      }

      ws.on("close", () => {
        console.log(`Companion connection closed: ${pairingCode}`);
        companionConnections.delete(pairingCode);
        const matchingVoiceWs = voiceConnections.get(pairingCode);
        if (matchingVoiceWs && matchingVoiceWs.readyState === WebSocket.OPEN) {
          matchingVoiceWs.send(JSON.stringify({ type: "companion_status", status: "disconnected" }));
        }
      });
      return;
    }

    // 2. Main Live voice interface client connects
    const clientWs = ws;
    console.log(`Client connected to NV's live session. Pairing Code: ${pairingCode || "None"}`);

    if (pairingCode) {
      voiceConnections.set(pairingCode, clientWs);
      // Give initial handshake of connection status if a companion is already waiting
      const companionWs = companionConnections.get(pairingCode);
      if (companionWs && companionWs.readyState === WebSocket.OPEN) {
        setTimeout(() => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "companion_status", status: "connected" }));
          }
        }, 500);
      }
    }

    if (!apiKey) {
      clientWs.send(JSON.stringify({ 
        type: "error", 
        message: "Gemini API Key is not configured in the server environment. Please set GEMINI_API_KEY in the Secrets panel." 
      }));
      clientWs.close();
      return;
    }

    let geminiSession: any = null;
    let isConnected = false;

    // Parse and dynamically build system instructions with memories from client
    let dynamicSystemInstruction = NVPersonaSystemInstruction;
    const memoriesParam = url.searchParams.get("memories");
    if (memoriesParam) {
      try {
        const memories = JSON.parse(decodeURIComponent(memoriesParam));
        if (Array.isArray(memories) && memories.length > 0) {
          dynamicSystemInstruction += `\n\n[MEMORIES ABOUT THE USER (Aapko yeh sab yaad hai)]:
${memories.map((m: any, idx: number) => `- ${m.text || m}`).join("\n")}
Use these personal variables organically without making them sound artificial. Address them occasionally in Hinglish by their details!`;
        }
      } catch (e) {
        console.error("Failed to decode memories query parameter:", e);
      }
    }

    // Connect to Gemini Live API
    try {
      console.log("Connecting to Gemini Live API...");
      geminiSession = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: any) => {
            // 1. Relaying audio response
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              clientWs.send(JSON.stringify({ type: "audio", audio: base64Audio }));
            }

            // 2. Relaying text transcriptions if available (subtitles)
            const modelTranscript = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelTranscript) {
              clientWs.send(JSON.stringify({ type: "transcript", text: modelTranscript }));
            }

            // 2b. Relay metadata transcriptions (sometimes the model returns audio transcriptions in separate chunks)
            const outputTranscription = message.serverContent?.modelTurn?.parts?.find((p: any) => p.text)?.text;
            if (outputTranscription) {
              clientWs.send(JSON.stringify({ type: "transcript", text: outputTranscription }));
            }

            // 3. Relaying interruption
            if (message.serverContent?.interrupted) {
              console.log("Model turn was interrupted.");
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            // 4. Handle Function Calling (openWebsite / executeLocalCommand)
            if (message.toolCall) {
              const { functionCalls } = message.toolCall;
              if (functionCalls) {
                for (const func of functionCalls) {
                  if (func.name === "openWebsite") {
                    const url = func.args.url;
                    const siteName = func.args.siteName;
                    console.log(`Tool openWebsite was called: ${siteName} (${url})`);

                    // Send action request to client WebSocket so their browser UI can show it nicely
                    clientWs.send(JSON.stringify({
                      type: "action",
                      name: "openWebsite",
                      url: url,
                      siteName: siteName
                    }));

                    // ALSO: If pairing script is linked, launch the web url directly in their laptop browser!
                    // This bypasses browser popup blockings and Brave shields entirely!
                    const companionWs = pairingCode ? companionConnections.get(pairingCode) : null;
                    const isLinked = !!(companionWs && companionWs.readyState === WebSocket.OPEN);
                    if (isLinked) {
                      try {
                        companionWs!.send(JSON.stringify({
                          type: "command",
                          action: "open_browser",
                          command: url,
                          friendlyDescription: `Spawning direct system launch of ${siteName} on your device!`
                        }));
                      } catch (err) {
                        console.error("Error relaying website launch to companion WebSocket:", err);
                      }
                    }

                    // Instantly notify Gemini that the tool was triggered, so it continues speaking seamlessly
                    try {
                      geminiSession.sendToolResponse({
                        functionResponses: [
                          {
                            name: "openWebsite",
                            id: func.id,
                            response: { 
                              output: { 
                                success: true, 
                                message: `Successfully requested client to open ${siteName} at ${url}` 
                              } 
                            }
                          }
                        ]
                      });
                    } catch (err) {
                      console.error("Error sending tool response to Gemini:", err);
                    }
                  } else if (func.name === "executeLocalCommand") {
                    const action = func.args.action;
                    const command = func.args.command || "";
                    const friendlyDescription = func.args.friendlyDescription;
                    console.log(`Tool executeLocalCommand requested: action=${action}, cmd=${command}`);

                    const companionWs = pairingCode ? companionConnections.get(pairingCode) : null;
                    const isLinked = !!(companionWs && companionWs.readyState === WebSocket.OPEN);

                    if (isLinked) {
                      try {
                        // Forward payload to the paired laptop daemon
                        companionWs!.send(JSON.stringify({
                          type: "command",
                          action,
                          command,
                          friendlyDescription
                        }));
                      } catch (err) {
                        console.error("Error relaying command to companion WebSocket:", err);
                      }
                    }

                    // Send local event back to primary workspace browser client
                    clientWs.send(JSON.stringify({
                      type: "action",
                      name: "executeLocalCommand",
                      action,
                      command,
                      friendlyDescription,
                      executed: isLinked
                    }));

                    // Reply to Gemini right away so we don't block conversational flow
                    try {
                      geminiSession.sendToolResponse({
                        functionResponses: [
                          {
                            name: "executeLocalCommand",
                            id: func.id,
                            response: { 
                              output: { 
                                success: isLinked, 
                                message: isLinked 
                                  ? `Successfully executed system operation '${action}' on user's laptop.`
                                  : `Device operation failed because no laptop companion is linked. Tell the user in Hinglish to copy and run the python companion script displayed on NV's dashboard to link their device!`
                              } 
                            }
                          }
                        ]
                      });
                    } catch (err) {
                      console.error("Error sending tool response to Gemini:", err);
                    }
                  } else if (func.name === "saveMemory") {
                    const text = func.args.text;
                    const friendlyDescription = func.args.friendlyDescription;
                    console.log(`Tool saveMemory requested: "${text}"`);

                    // Send back to client voice ws
                    clientWs.send(JSON.stringify({
                      type: "save_memory",
                      text
                    }));

                    try {
                      geminiSession.sendToolResponse({
                        functionResponses: [
                          {
                            name: "saveMemory",
                            id: func.id,
                            response: { 
                              output: { 
                                success: true, 
                                message: `Successfully saved fact '${text}' into user memories.`
                              } 
                            }
                          }
                        ]
                      });
                    } catch (err) {
                      console.error("Error sending tool response for saveMemory:", err);
                    }
                  }
                }
              }
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore", // Kore fits the youthful, expressive persona beautifully
              },
            },
          },
          systemInstruction: dynamicSystemInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website or platform for the user in a browser (e.g. YouTube, Google, GitHub, Wikipedia, dictionary, translation pages, weather pages, news, etc.). Ensure url starts with https://.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full, absolute URL of the website to open. Must start with http:// or https://.",
                      },
                      siteName: {
                        type: Type.STRING,
                        description: "A friendly name for the site being opened (e.g., 'Google' or 'Cute Puppies on YouTube').",
                      },
                    },
                    required: ["url", "siteName"],
                  },
                },
                {
                  name: "executeLocalCommand",
                  description: "Executes control commands on user's local device/laptop (e.g., volume adjustments, muting, locking screen, opening terminal/apps).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The system task, e.g. 'volume_up', 'volume_down', 'mute', 'open_app', 'lock_screen', 'sys_status'."
                      },
                      command: {
                        type: Type.STRING,
                        description: "Additional context such as app name (e.g., 'Spotify', 'Notepad', 'Chrome') or shell command instruction."
                      },
                      friendlyDescription: {
                        type: Type.STRING,
                        description: "A charismatic, friendly Hinglish narration of what you are doing (e.g. 'Aapka system block kar rahi hoon yaar, ab refresh hone do!', 'Volume badha diya, suno gana!')."
                      }
                    },
                    required: ["action", "friendlyDescription"]
                  }
                },
                {
                  name: "saveMemory",
                  description: "Saves a personal fact, name, job, or custom preference regarding the user to NV's memory vault to remember forever.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The description of the memory or fact to hold (e.g., 'Sachin likes tea and code in React'). Let it be specific and clean."
                      },
                      friendlyDescription: {
                        type: Type.STRING,
                        description: "A friendly, sassy Hinglish narration of what you are locking into memory."
                      }
                    },
                    required: ["text", "friendlyDescription"]
                  }
                }
              ],
            },
          ],
        },
      });

      isConnected = true;
      console.log("Connected to Gemini Live API");
      clientWs.send(JSON.stringify({ type: "status", state: "connected" }));

    } catch (error: any) {
      console.error("Error establishing Gemini Live Session:", error);
      clientWs.send(JSON.stringify({ 
        type: "error", 
        message: "Failed to connect to the Gemini Live service. " + (error?.message || "") 
      }));
      clientWs.close();
      return;
    }

    // Handle messages from the client
    clientWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.audio && isConnected && geminiSession) {
          // Send user speech to Gemini Live API
          geminiSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.type === "interrupted" && isConnected && geminiSession) {
          // Tell Gemini that client interrupted
          console.log("Interruption signal forwarded to Gemini session");
          // Currently, sending input or audioStreamEnd acts as an interrupt, or automatic VAD does it.
          // In genai.d.ts, LiveSendRealtimeInputParameters supports `activityStart` or simply speaking.
        }
      } catch (err) {
        console.error("Error processing websocket message from client:", err);
      }
    });

    // Cleanup on disconnect
    clientWs.on("close", () => {
      console.log("Client disconnected, closing Gemini Live connection");
      if (geminiSession) {
        try {
          geminiSession.close();
        } catch (e) {
          console.error("Error closing Gemini Live Session:", e);
        }
      }
      isConnected = false;
    });
  });

  // Serve static assets
  if (process.env.NODE_ENV !== "production") {
    // Development mode with Vite dev middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Static files built inside dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
