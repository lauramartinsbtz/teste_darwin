#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// =============================================================
// INVENTORBLOCKS - ESP32-S3 - USB + BLUETOOTH LE
//
// O mesmo protocolo textual funciona nas duas interfaces:
//
//   PING
//   LigarLed D0
//   DesligarLed D0
//   LigarSirene D1
//   DesligarSirene D1
//   LerBotao D2
//
// USB: Serial / USB CDC, 115200 baud.
// BLE: serviço tipo UART (Nordic UART Service - NUS).
// =============================================================

enum PortaInventor {
  D0,
  D1,
  D2,
  D3,
  PORTA_INVALIDA
};

enum OrigemComando {
  ORIGEM_USB,
  ORIGEM_BLE
};

// -------------------------------------------------------------
// MAPEAMENTO FÍSICO ESP32-S3
// -------------------------------------------------------------
constexpr uint8_t GPIO_D0 = 4;
constexpr uint8_t GPIO_D1 = 5;
constexpr uint8_t GPIO_D2 = 6;
constexpr uint8_t GPIO_D3 = 7;

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr size_t TAMANHO_MAX_LINHA = 120;

// -------------------------------------------------------------
// BLUETOOTH LE - Nordic UART Service (NUS)
// RX = navegador escreve no ESP32
// TX = ESP32 envia notificações ao navegador
// -------------------------------------------------------------
static const char *BLE_DEVICE_NAME = "Darwin v7";
static const char *BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char *BLE_RX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char *BLE_TX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

BLEServer *bleServer = nullptr;
BLECharacteristic *bleTx = nullptr;
BLECharacteristic *bleRx = nullptr;
volatile bool bleConectado = false;

String linhaUsb;
String linhaBle;

// =============================================================
// CONVERSÃO DE PORTA
// =============================================================

uint8_t gpioDaPorta(PortaInventor porta) {
  switch (porta) {
    case D0: return GPIO_D0;
    case D1: return GPIO_D1;
    case D2: return GPIO_D2;
    case D3: return GPIO_D3;
    default: return 255;
  }
}

PortaInventor textoParaPorta(const String &texto) {
  if (texto == "D0") return D0;
  if (texto == "D1") return D1;
  if (texto == "D2") return D2;
  if (texto == "D3") return D3;
  return PORTA_INVALIDA;
}

// =============================================================
// FUNÇÕES INVENTORBLOCKS
// =============================================================

void LigarLed(PortaInventor porta) {
  uint8_t gpio = gpioDaPorta(porta);
  if (gpio == 255) return;

  pinMode(gpio, OUTPUT);
  digitalWrite(gpio, HIGH);
}

void DesligarLed(PortaInventor porta) {
  uint8_t gpio = gpioDaPorta(porta);
  if (gpio == 255) return;

  pinMode(gpio, OUTPUT);
  digitalWrite(gpio, LOW);
}

void LigarSirene(PortaInventor porta) {
  uint8_t gpio = gpioDaPorta(porta);
  if (gpio == 255) return;

  pinMode(gpio, OUTPUT);
  digitalWrite(gpio, HIGH);
}

void DesligarSirene(PortaInventor porta) {
  uint8_t gpio = gpioDaPorta(porta);
  if (gpio == 255) return;

  pinMode(gpio, OUTPUT);
  digitalWrite(gpio, LOW);
}

bool LerBotao(PortaInventor porta) {
  uint8_t gpio = gpioDaPorta(porta);
  if (gpio == 255) return false;

  // Botão entre a porta e GND. O pull-up interno mantém HIGH quando solto.
  pinMode(gpio, INPUT_PULLUP);
  return digitalRead(gpio) == LOW;
}

// =============================================================
// RESPOSTAS USB / BLE
// =============================================================

void enviarLinhaBle(const String &linha) {
  if (!bleConectado || bleTx == nullptr) return;

  String pacote = linha + "\n";
  bleTx->setValue((uint8_t *)pacote.c_str(), pacote.length());
  bleTx->notify();
}

void enviarResposta(OrigemComando origem, const String &linha) {
  if (origem == ORIGEM_USB) {
    Serial.println(linha);
  } else {
    enviarLinhaBle(linha);
  }
}

void responderOK(OrigemComando origem, const String &mensagem) {
  enviarResposta(origem, "OK " + mensagem);
}

void responderErro(OrigemComando origem, const String &mensagem) {
  enviarResposta(origem, "ERR " + mensagem);
}

// =============================================================
// INTERPRETADOR COMUM ÀS DUAS INTERFACES
// =============================================================

void executarComando(String comando, OrigemComando origem) {
  comando.trim();

  if (comando.length() == 0) return;

  if (comando == "PING") {
    responderOK(origem, "PONG");
    return;
  }

  int separador = comando.indexOf(' ');

  if (separador < 0) {
    responderErro(origem, "FORMATO_INVALIDO");
    return;
  }

  String funcao = comando.substring(0, separador);
  String textoPorta = comando.substring(separador + 1);
  textoPorta.trim();

  PortaInventor porta = textoParaPorta(textoPorta);

  if (porta == PORTA_INVALIDA) {
    responderErro(origem, "PORTA_INVALIDA");
    return;
  }

  if (funcao == "LigarLed") {
    LigarLed(porta);
    responderOK(origem, "LigarLed " + textoPorta);
    return;
  }

  if (funcao == "DesligarLed") {
    DesligarLed(porta);
    responderOK(origem, "DesligarLed " + textoPorta);
    return;
  }

  if (funcao == "LigarSirene") {
    LigarSirene(porta);
    responderOK(origem, "LigarSirene " + textoPorta);
    return;
  }

  if (funcao == "DesligarSirene") {
    DesligarSirene(porta);
    responderOK(origem, "DesligarSirene " + textoPorta);
    return;
  }

  if (funcao == "LerBotao") {
    responderOK(origem, LerBotao(porta) ? "1" : "0");
    return;
  }

  responderErro(origem, "COMANDO_DESCONHECIDO");
}

// =============================================================
// RECEPÇÃO EM LINHAS
// =============================================================

void receberCaractere(char caractere, String &buffer, OrigemComando origem) {
  if (caractere == '\n') {
    executarComando(buffer, origem);
    buffer = "";
    return;
  }

  if (caractere == '\r') return;

  buffer += caractere;

  if (buffer.length() > TAMANHO_MAX_LINHA) {
    buffer = "";
    responderErro(origem, "LINHA_MUITO_LONGA");
  }
}

// =============================================================
// CALLBACKS BLUETOOTH LE
// =============================================================

class InventorServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    bleConectado = true;
    Serial.println("BLE CLIENT CONNECTED");
  }

  void onDisconnect(BLEServer *server) override {
    bleConectado = false;
    linhaBle = "";
    Serial.println("BLE CLIENT DISCONNECTED");

    // Mantém a placa visível para uma nova conexão.
    BLEDevice::startAdvertising();
  }
};

class InventorRxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String valor = characteristic->getValue();

    for (size_t i = 0; i < valor.length(); i++) {
      receberCaractere(valor[i], linhaBle, ORIGEM_BLE);
    }
  }
};

void iniciarBluetoothLe() {
  BLEDevice::init(BLE_DEVICE_NAME);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new InventorServerCallbacks());
  bleServer->advertiseOnDisconnect(true);

  BLEService *service = bleServer->createService(BLE_SERVICE_UUID);

  bleTx = service->createCharacteristic(
    BLE_TX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );
  bleTx->addDescriptor(new BLE2902());

  bleRx = service->createCharacteristic(
    BLE_RX_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  bleRx->setCallbacks(new InventorRxCallbacks());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMaxPreferred(0x12);

  BLEDevice::startAdvertising();
}

// =============================================================
// ARDUINO
// =============================================================

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);

  Serial.println("READY INVENTORBLOCKS USB");

  iniciarBluetoothLe();

  Serial.print("READY INVENTORBLOCKS BLE: ");
  Serial.println(BLE_DEVICE_NAME);
}

void loop() {
  // USB CDC / Web Serial
  while (Serial.available() > 0) {
    char caractere = (char)Serial.read();
    receberCaractere(caractere, linhaUsb, ORIGEM_USB);
  }

  delay(1);
}
