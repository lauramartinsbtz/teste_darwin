let workspace;

/* =========================================================
   ESTADO DAS CONEXÕES
   ========================================================= */

// USB / Web Serial
let port = null;
let reader = null;
let writer = null;
let serialBuffer = "";
let serialReading = false;

// Bluetooth LE / Web Bluetooth
const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // navegador -> ESP32
const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 -> navegador

let bleDevice = null;
let bleServer = null;
let bleRxCharacteristic = null;
let bleTxCharacteristic = null;
let bleBuffer = "";

// O canal ativo evita executar um mesmo comando duas vezes quando
// USB e BLE estiverem conectados simultaneamente.
let activeTransport = null; // "usb" | "ble" | null

const pendingResponses = {
  usb: [],
  ble: []
};

let executing = false;
let stopRequested = false;

const consoleEl = document.getElementById("console");
const codeEl = document.getElementById("generatedCode");
const statusUsbEl = document.getElementById("statusUsb");
const statusBleEl = document.getElementById("statusBle");
const statusActiveEl = document.getElementById("statusActive");

const btnConnectUsb = document.getElementById("btnConnectUsb");
const btnDisconnectUsb = document.getElementById("btnDisconnectUsb");
const btnConnectBle = document.getElementById("btnConnectBle");
const btnDisconnectBle = document.getElementById("btnDisconnectBle");
const btnRun = document.getElementById("btnRun");
const btnStop = document.getElementById("btnStop");
const btnClear = document.getElementById("btnClear");
const btnClearConsole = document.getElementById("btnClearConsole");

function appLog(message) {
  const now = new Date().toLocaleTimeString();
  consoleEl.textContent += `[${now}] ${message}\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function usbConnected() {
  return !!(port && writer);
}

function bleConnected() {
  return !!(
    bleDevice &&
    bleDevice.gatt &&
    bleDevice.gatt.connected &&
    bleRxCharacteristic &&
    bleTxCharacteristic
  );
}

function ensureActiveTransport() {
  if (activeTransport === "usb" && usbConnected()) return "usb";
  if (activeTransport === "ble" && bleConnected()) return "ble";

  if (usbConnected()) {
    activeTransport = "usb";
    return "usb";
  }

  if (bleConnected()) {
    activeTransport = "ble";
    return "ble";
  }

  activeTransport = null;
  return null;
}

function setActiveTransport(transport) {
  if (transport === "usb" && !usbConnected()) return;
  if (transport === "ble" && !bleConnected()) return;

  activeTransport = transport;
  updateConnectionUi();
}

function updateConnectionUi() {
  const usb = usbConnected();
  const ble = bleConnected();
  ensureActiveTransport();

  statusUsbEl.textContent = `USB: ${usb ? "conectado" : "desconectado"}${activeTransport === "usb" ? " • ATIVO" : ""}`;
  statusUsbEl.className = "status " + (usb ? "connected" : "disconnected");

  statusBleEl.textContent = `Bluetooth LE: ${ble ? "conectado" : "desconectado"}${activeTransport === "ble" ? " • ATIVO" : ""}`;
  statusBleEl.className = "status " + (ble ? "connected" : "disconnected");

  statusActiveEl.textContent = activeTransport === "usb"
    ? "Canal ativo: USB"
    : activeTransport === "ble"
      ? "Canal ativo: Bluetooth LE"
      : "Canal ativo: nenhum";
  statusActiveEl.className = "status " + (activeTransport ? "connected" : "neutral");

  btnConnectUsb.textContent = usb ? (activeTransport === "usb" ? "USB ativo" : "Usar USB") : "Conectar USB";
  btnConnectUsb.disabled = !("serial" in navigator) || (usb && activeTransport === "usb");
  btnDisconnectUsb.disabled = !usb;

  btnConnectBle.textContent = ble ? (activeTransport === "ble" ? "Bluetooth ativo" : "Usar Bluetooth") : "Conectar Bluetooth";
  btnConnectBle.disabled = !("bluetooth" in navigator) || (ble && activeTransport === "ble");
  btnDisconnectBle.disabled = !ble;
}

function setExecuting(value) {
  executing = value;
  btnRun.disabled = value;
  btnStop.disabled = !value;
}

function rejectPending(transport, message) {
  const queue = pendingResponses[transport];

  while (queue.length > 0) {
    const pending = queue.shift();
    clearTimeout(pending.timeout);
    pending.reject(new Error(message));
  }
}

/* =========================================================
   GERAÇÃO DO CÓDIGO ARDUINO
   ========================================================= */

function getNumberFromInput(block, inputName, fallback = 1000) {
  const target = block.getInputTargetBlock(inputName);

  if (!target) return fallback;

  if (target.type === "math_number") {
    const number = Number(target.getFieldValue("NUM"));
    return Number.isFinite(number) ? number : fallback;
  }

  return fallback;
}

function arduinoCondition(block) {
  if (!block) return "false";

  if (block.type === "ler_botao") {
    return `LerBotao(${block.getFieldValue("PORT")})`;
  }

  return "false";
}

function arduinoForBlock(block, indent = "  ") {
  if (!block) return "";

  let line = "";

  switch (block.type) {
    case "ligar_led":
      line = `${indent}LigarLed(${block.getFieldValue("PORT")});\n`;
      break;

    case "desligar_led":
      line = `${indent}DesligarLed(${block.getFieldValue("PORT")});\n`;
      break;

    case "ligar_sirene":
      line = `${indent}LigarSirene(${block.getFieldValue("PORT")});\n`;
      break;

    case "desligar_sirene":
      line = `${indent}DesligarSirene(${block.getFieldValue("PORT")});\n`;
      break;

    case "se_entao": {
      const condition = arduinoCondition(block.getInputTargetBlock("COND"));
      const body = arduinoForBlock(block.getInputTargetBlock("DO"), indent + "  ");
      line = `${indent}if (${condition}) {\n${body}${indent}}\n`;
      break;
    }

    case "esperar_ms":
      line = `${indent}delay(${getNumberFromInput(block, "TIME", 1000)});\n`;
      break;

    default:
      line = `${indent}// Bloco não reconhecido: ${block.type}\n`;
      break;
  }

  return line + arduinoForBlock(block.getNextBlock(), indent);
}

function findStartBlock() {
  return workspace.getTopBlocks(true).find(block => block.type === "inicio") || null;
}

function generateArduinoCode() {
  const start = findStartBlock();

  if (!start) {
    return `// Adicione o bloco "Início".\n`;
  }

  const first = start.getInputTargetBlock("DO");
  const loopBody = arduinoForBlock(first, "  ");

  return `#include <Arduino.h>

enum PortaInventor {
  D0,
  D1,
  D2,
  D3
};

void LigarLed(PortaInventor porta);
void DesligarLed(PortaInventor porta);
void LigarSirene(PortaInventor porta);
void DesligarSirene(PortaInventor porta);
bool LerBotao(PortaInventor porta);

void setup() {
  // Inicialização feita pelas funções quando necessário.
}

void loop() {
${loopBody || "  // Conecte os comandos dentro do bloco Início.\n"}}
}
`;
}

function updateGeneratedCode() {
  codeEl.textContent = generateArduinoCode();
}

/* =========================================================
   PROTOCOLO DE RESPOSTA COMUM
   ========================================================= */

function handleIncomingLine(line, transport) {
  line = line.replace("\r", "").trim();
  if (!line) return;

  const label = transport === "usb" ? "USB" : "BLE";
  appLog(`← ${label} ${line}`);

  if (line.startsWith("READY")) return;

  if ((line.startsWith("OK") || line.startsWith("ERR")) &&
      pendingResponses[transport].length > 0) {
    const pending = pendingResponses[transport].shift();
    clearTimeout(pending.timeout);

    if (line.startsWith("OK")) {
      pending.resolve(line);
    } else {
      pending.reject(new Error(line));
    }
  }
}

function consumeTextBuffer(text, transport) {
  if (transport === "usb") {
    serialBuffer += text;

    let pos;
    while ((pos = serialBuffer.indexOf("\n")) >= 0) {
      const line = serialBuffer.slice(0, pos);
      serialBuffer = serialBuffer.slice(pos + 1);
      handleIncomingLine(line, "usb");
    }
    return;
  }

  bleBuffer += text;

  let pos;
  while ((pos = bleBuffer.indexOf("\n")) >= 0) {
    const line = bleBuffer.slice(0, pos);
    bleBuffer = bleBuffer.slice(pos + 1);
    handleIncomingLine(line, "ble");
  }
}

/* =========================================================
   USB / WEB SERIAL
   ========================================================= */

async function connectSerial() {
  if (usbConnected()) {
    setActiveTransport("usb");
    appLog("USB selecionado como canal ativo.");
    return;
  }

  if (!("serial" in navigator)) {
    throw new Error("Web Serial não está disponível neste navegador.");
  }

  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });

  writer = port.writable.getWriter();
  reader = port.readable.getReader();

  serialReading = true;
  activeTransport = "usb";
  updateConnectionUi();
  appLog("USB conectado em 115200 baud e selecionado como canal ativo.");

  readSerialLoop();

  await waitMs(400);

  try {
    await sendCommandVia("usb", "PING", 1500);
  } catch (error) {
    appLog("Aviso: ESP32-S3 não respondeu ao PING pelo USB.");
  }
}

async function disconnectSerial() {
  serialReading = false;
  rejectPending("usb", "USB desconectado.");

  try {
    if (reader) {
      await reader.cancel();
      reader.releaseLock();
    }
  } catch (e) {}

  try {
    if (writer) writer.releaseLock();
  } catch (e) {}

  try {
    if (port) await port.close();
  } catch (e) {}

  reader = null;
  writer = null;
  port = null;
  serialBuffer = "";

  if (activeTransport === "usb") activeTransport = null;
  ensureActiveTransport();
  updateConnectionUi();
  appLog("USB desconectado.");
}

async function readSerialLoop() {
  const decoder = new TextDecoder();

  try {
    while (serialReading && reader) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      consumeTextBuffer(decoder.decode(value, { stream: true }), "usb");
    }
  } catch (error) {
    if (serialReading) {
      appLog("Erro de leitura USB: " + error.message);
    }
  }
}

/* =========================================================
   BLUETOOTH LE / WEB BLUETOOTH
   ========================================================= */

function handleBleNotification(event) {
  const value = event.target.value;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  consumeTextBuffer(new TextDecoder().decode(bytes), "ble");
}

function handleBleDisconnected() {
  rejectPending("ble", "Bluetooth LE desconectado.");

  if (bleTxCharacteristic) {
    try {
      bleTxCharacteristic.removeEventListener("characteristicvaluechanged", handleBleNotification);
    } catch (e) {}
  }

  bleServer = null;
  bleRxCharacteristic = null;
  bleTxCharacteristic = null;
  bleBuffer = "";

  if (activeTransport === "ble") activeTransport = null;
  ensureActiveTransport();
  updateConnectionUi();
  appLog("Bluetooth LE desconectado.");
}

async function connectBluetooth() {
  if (bleConnected()) {
    setActiveTransport("ble");
    appLog("Bluetooth LE selecionado como canal ativo.");
    return;
  }

  if (!("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth não está disponível neste navegador.");
  }

  if (!window.isSecureContext) {
    throw new Error("Bluetooth no navegador exige uma página em contexto seguro (HTTPS)." );
  }

  bleDevice = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [BLE_SERVICE_UUID] }
    ],
    optionalServices: [BLE_SERVICE_UUID]
  });

  bleDevice.addEventListener("gattserverdisconnected", handleBleDisconnected);

  bleServer = await bleDevice.gatt.connect();
  const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
  bleRxCharacteristic = await service.getCharacteristic(BLE_RX_UUID);
  bleTxCharacteristic = await service.getCharacteristic(BLE_TX_UUID);

  await bleTxCharacteristic.startNotifications();
  bleTxCharacteristic.addEventListener("characteristicvaluechanged", handleBleNotification);

  activeTransport = "ble";
  updateConnectionUi();
  appLog(`Bluetooth LE conectado a ${bleDevice.name || "ESP32-S3"} e selecionado como canal ativo.`);

  await waitMs(150);

  try {
    await sendCommandVia("ble", "PING", 2000);
  } catch (error) {
    appLog("Aviso: ESP32-S3 não respondeu ao PING pelo Bluetooth LE.");
  }
}

async function disconnectBluetooth() {
  rejectPending("ble", "Bluetooth LE desconectado.");

  if (bleTxCharacteristic) {
    try {
      bleTxCharacteristic.removeEventListener("characteristicvaluechanged", handleBleNotification);
    } catch (e) {}
  }

  try {
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  } catch (e) {}

  bleServer = null;
  bleRxCharacteristic = null;
  bleTxCharacteristic = null;
  bleBuffer = "";

  if (activeTransport === "ble") activeTransport = null;
  ensureActiveTransport();
  updateConnectionUi();
  appLog("Bluetooth LE desconectado.");
}

/* =========================================================
   ENVIO DE COMANDOS - USB OU BLE
   ========================================================= */

async function writeTransport(transport, command) {
  const data = new TextEncoder().encode(command + "\n");

  if (transport === "usb") {
    if (!writer) throw new Error("USB não está conectado.");
    await writer.write(data);
    return;
  }

  if (transport === "ble") {
    if (!bleRxCharacteristic || !bleConnected()) {
      throw new Error("Bluetooth LE não está conectado.");
    }

    if (typeof bleRxCharacteristic.writeValueWithoutResponse === "function") {
      await bleRxCharacteristic.writeValueWithoutResponse(data);
    } else {
      await bleRxCharacteristic.writeValue(data);
    }
    return;
  }

  throw new Error("Canal de comunicação inválido.");
}

async function sendCommandVia(transport, command, timeoutMs = 2000) {
  const connected = transport === "usb" ? usbConnected() : bleConnected();

  if (!connected) {
    throw new Error(`${transport === "usb" ? "USB" : "Bluetooth LE"} não está conectado.`);
  }

  const label = transport === "usb" ? "USB" : "BLE";
  appLog(`→ ${label} ${command}`);

  let pending;

  const response = new Promise((resolve, reject) => {
    pending = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        const queue = pendingResponses[transport];
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
        reject(new Error(`ESP32-S3 não respondeu via ${label}: ${command}`));
      }, timeoutMs)
    };

    pendingResponses[transport].push(pending);
  });

  try {
    await writeTransport(transport, command);
  } catch (error) {
    const queue = pendingResponses[transport];
    const index = queue.indexOf(pending);
    if (index >= 0) queue.splice(index, 1);
    clearTimeout(pending.timeout);
    throw error;
  }

  return response;
}

async function sendCommand(command, timeoutMs = 2000) {
  const transport = ensureActiveTransport();
  updateConnectionUi();

  if (!transport) {
    throw new Error("ESP32-S3 não está conectado por USB nem por Bluetooth LE.");
  }

  return sendCommandVia(transport, command, timeoutMs);
}

/* =========================================================
   EXECUÇÃO DOS BLOCOS NO NAVEGADOR
   ========================================================= */

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function evaluateCondition(block) {
  if (!block) return false;

  if (block.type === "ler_botao") {
    const response = await sendCommand(`LerBotao ${block.getFieldValue("PORT")}`);
    const value = response.trim().split(/\s+/).pop();
    return value === "1" || value.toUpperCase() === "HIGH" || value.toUpperCase() === "TRUE";
  }

  return false;
}

async function executeBlock(block) {
  if (!block || stopRequested) return;

  switch (block.type) {
    case "ligar_led":
      await sendCommand(`LigarLed ${block.getFieldValue("PORT")}`);
      break;

    case "desligar_led":
      await sendCommand(`DesligarLed ${block.getFieldValue("PORT")}`);
      break;

    case "ligar_sirene":
      await sendCommand(`LigarSirene ${block.getFieldValue("PORT")}`);
      break;

    case "desligar_sirene":
      await sendCommand(`DesligarSirene ${block.getFieldValue("PORT")}`);
      break;

    case "se_entao": {
      const condition = await evaluateCondition(block.getInputTargetBlock("COND"));
      if (condition && !stopRequested) {
        await executeSequence(block.getInputTargetBlock("DO"));
      }
      break;
    }

    case "esperar_ms":
      await waitMs(getNumberFromInput(block, "TIME", 1000));
      break;
  }
}

async function executeSequence(firstBlock) {
  let current = firstBlock;

  while (current && !stopRequested) {
    await executeBlock(current);
    current = current.getNextBlock();
  }
}

async function executeProgram() {
  if (!ensureActiveTransport()) {
    appLog("Conecte o ESP32-S3 por USB ou Bluetooth LE antes de executar.");
    return;
  }

  const start = findStartBlock();

  if (!start) {
    appLog('Adicione o bloco "Início" ao programa.');
    return;
  }

  const first = start.getInputTargetBlock("DO");

  if (!first) {
    appLog('Conecte comandos dentro do bloco "Início".');
    return;
  }

  stopRequested = false;
  setExecuting(true);

  appLog(`Programa iniciado em loop via ${activeTransport === "usb" ? "USB" : "Bluetooth LE"}.`);

  try {
    while (!stopRequested) {
      await executeSequence(first);
      await waitMs(0);
    }
  } catch (error) {
    appLog("Erro de execução: " + error.message);
  } finally {
    setExecuting(false);

    if (stopRequested) {
      appLog("Programa interrompido.");
    }
  }
}

/* =========================================================
   INTERFACE
   ========================================================= */

window.addEventListener("load", () => {
  workspace = Blockly.inject("blocklyDiv", {
    toolbox: INVENTOR_TOOLBOX,
    trashcan: true,
    scrollbars: true,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.95,
      minScale: 0.4,
      maxScale: 2
    }
  });

  workspace.addChangeListener(updateGeneratedCode);
  updateGeneratedCode();
  updateConnectionUi();

  const usbAvailable = "serial" in navigator;
  const bleAvailable = "bluetooth" in navigator;

  appLog("INVENTORBLOCKS pronto para USB e Bluetooth LE.");
  appLog(`Web Serial: ${usbAvailable ? "disponível" : "indisponível"}. Web Bluetooth: ${bleAvailable ? "disponível" : "indisponível"}.`);

  if (bleAvailable && !window.isSecureContext) {
    appLog("Bluetooth LE requer abrir o InventorBlocks em HTTPS no navegador.");
  }
});

btnConnectUsb.addEventListener("click", async () => {
  try {
    await connectSerial();
  } catch (error) {
    appLog("Erro ao conectar USB: " + error.message);
    updateConnectionUi();
  }
});

btnDisconnectUsb.addEventListener("click", disconnectSerial);

btnConnectBle.addEventListener("click", async () => {
  try {
    await connectBluetooth();
  } catch (error) {
    appLog("Erro ao conectar Bluetooth LE: " + error.message);
    updateConnectionUi();
  }
});

btnDisconnectBle.addEventListener("click", disconnectBluetooth);
btnRun.addEventListener("click", executeProgram);

btnStop.addEventListener("click", () => {
  stopRequested = true;
});

btnClear.addEventListener("click", () => {
  workspace.clear();
  appLog("Blocos removidos.");
});

btnClearConsole.addEventListener("click", () => {
  consoleEl.textContent = "";
});
