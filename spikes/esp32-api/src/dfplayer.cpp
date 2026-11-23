// The DFPlayer Mini for the lab's board library: see include/DFRobotDFPlayerMini.h.
#include "DFRobotDFPlayerMini.h"

namespace {
uint16_t checksum(const uint8_t* body) {
  uint16_t sum = 0;
  for (int i = 0; i < 6; i++) sum += body[i];
  return (uint16_t)(0 - sum);
}
}  // namespace

void DFRobotDFPlayerMini::send(uint8_t command, uint16_t parameter) {
  if (!stream_) return;
  uint8_t out[10] = {0x7E, 0xFF, 0x06, command, (uint8_t)(ack_ ? 1 : 0),
                     (uint8_t)(parameter >> 8), (uint8_t)parameter, 0, 0, 0xEF};
  uint16_t sum = checksum(out + 1);
  out[7] = (uint8_t)(sum >> 8);
  out[8] = (uint8_t)sum;
  stream_->write(out, 10);
  // The player needs a moment between commands.
  if (ack_) {
    unsigned long started = millis();
    while (millis() - started < timeOut_) {
      if (receive()) {
        if (command_ == 0x41) return;
        sort();
        pending_ = true;
      }
      delay(1);
    }
  } else {
    delay(10);
  }
}

bool DFRobotDFPlayerMini::receive() {
  while (stream_ && stream_->available()) {
    int byte = stream_->read();
    if (count_ == 0 && byte != 0x7E) continue;
    in_[count_++] = (uint8_t)byte;
    if (count_ < 10) continue;
    count_ = 0;
    uint16_t sum = (uint16_t)((in_[7] << 8) | in_[8]);
    if (in_[9] != 0xEF || in_[1] != 0xFF || in_[2] != 0x06) {
      command_ = 0;
      type_ = WrongStack;
      parameter_ = 0;
      return true;
    }
    if (sum != checksum(in_ + 1)) {
      command_ = 0x40;
      type_ = DFPlayerError;
      parameter_ = CheckSumNotMatch;
      return true;
    }
    command_ = in_[3];
    parameter_ = (uint16_t)((in_[5] << 8) | in_[6]);
    return true;
  }
  return false;
}

void DFRobotDFPlayerMini::sort() {
  switch (command_) {
    case 0x3D:
    case 0x3C:
    case 0x3E:
      type_ = DFPlayerPlayFinished;
      break;
    case 0x3F:
      type_ = (parameter_ & 0x02) ? DFPlayerCardOnline
              : (parameter_ & 0x01) ? DFPlayerUSBOnline
                                    : DFPlayerCardUSBOnline;
      break;
    case 0x3A:
      type_ = (parameter_ & 0x02) ? DFPlayerCardInserted : DFPlayerUSBInserted;
      break;
    case 0x3B:
      type_ = (parameter_ & 0x02) ? DFPlayerCardRemoved : DFPlayerUSBRemoved;
      break;
    case 0x40:
      type_ = DFPlayerError;
      break;
    case 0x41:
      type_ = DFPlayerFeedBack;
      break;
    default:
      // An answer to a query: the caller reads it.
      break;
  }
}

bool DFRobotDFPlayerMini::wait() {
  unsigned long started = millis();
  while (millis() - started < timeOut_) {
    if (receive()) return true;
    delay(1);
  }
  type_ = TimeOut;
  return false;
}

bool DFRobotDFPlayerMini::begin(Stream& stream, bool isACK, bool doReset) {
  stream_ = &stream;
  ack_ = isACK;
  if (doReset) {
    bool ack = ack_;
    ack_ = false;
    send(0x0C);
    ack_ = ack;
    // Reading the card takes a while: wait for the player to say it is ready.
    unsigned long saved = timeOut_;
    timeOut_ = 3000;
    bool heard = false;
    while (wait()) {
      sort();
      if (command_ == 0x3F || type_ == DFPlayerError) {
        heard = true;
        break;
      }
    }
    timeOut_ = saved;
    if (!heard) type_ = TimeOut;
    delay(200);
  } else {
    type_ = DFPlayerCardOnline;
  }
  return type_ == DFPlayerCardOnline || type_ == DFPlayerUSBOnline ||
         type_ == DFPlayerCardUSBOnline || !isACK;
}

bool DFRobotDFPlayerMini::available() {
  if (pending_) {
    pending_ = false;
    return true;
  }
  if (!receive()) return false;
  sort();
  return command_ != 0x41;
}

int DFRobotDFPlayerMini::query(uint8_t command, uint16_t parameter) {
  bool ack = ack_;
  ack_ = false;
  send(command, parameter);
  ack_ = ack;
  unsigned long started = millis();
  while (millis() - started < timeOut_) {
    if (receive()) {
      if (command_ == command) return parameter_;
      sort();
      if (type_ == DFPlayerError) return -1;
      pending_ = true;
    }
    delay(1);
  }
  type_ = TimeOut;
  return -1;
}

void DFRobotDFPlayerMini::next() { send(0x01); }
void DFRobotDFPlayerMini::previous() { send(0x02); }
void DFRobotDFPlayerMini::play(int fileNumber) { send(0x03, (uint16_t)fileNumber); }
void DFRobotDFPlayerMini::volumeUp() { send(0x04); }
void DFRobotDFPlayerMini::volumeDown() { send(0x05); }
void DFRobotDFPlayerMini::volume(uint8_t volume) { send(0x06, volume); }
void DFRobotDFPlayerMini::EQ(uint8_t eq) { send(0x07, eq); }
void DFRobotDFPlayerMini::loop(int fileNumber) { send(0x08, (uint16_t)fileNumber); }
void DFRobotDFPlayerMini::outputDevice(uint8_t device) {
  send(0x09, device);
  delay(200);
}
void DFRobotDFPlayerMini::sleep() { send(0x0A); }
void DFRobotDFPlayerMini::reset() { send(0x0C); }
void DFRobotDFPlayerMini::start() { send(0x0D); }
void DFRobotDFPlayerMini::pause() { send(0x0E); }
void DFRobotDFPlayerMini::playFolder(uint8_t folderNumber, uint8_t fileNumber) {
  send(0x0F, (uint16_t)((folderNumber << 8) | fileNumber));
}
void DFRobotDFPlayerMini::outputSetting(bool enable, uint8_t gain) {
  send(0x10, (uint16_t)((enable << 8) | gain));
}
void DFRobotDFPlayerMini::enableLoopAll() { send(0x11, 1); }
void DFRobotDFPlayerMini::disableLoopAll() { send(0x11, 0); }
void DFRobotDFPlayerMini::playMp3Folder(int fileNumber) { send(0x12, (uint16_t)fileNumber); }
void DFRobotDFPlayerMini::advertise(int fileNumber) { send(0x13, (uint16_t)fileNumber); }
void DFRobotDFPlayerMini::playLargeFolder(uint8_t folderNumber, uint16_t fileNumber) {
  send(0x14, (uint16_t)(((uint16_t)folderNumber << 12) | fileNumber));
}
void DFRobotDFPlayerMini::stopAdvertise() { send(0x15); }
void DFRobotDFPlayerMini::stop() { send(0x16); }
void DFRobotDFPlayerMini::loopFolder(int folderNumber) { send(0x17, (uint16_t)folderNumber); }
void DFRobotDFPlayerMini::randomAll() { send(0x18); }
void DFRobotDFPlayerMini::enableLoop() { send(0x19, 0); }
void DFRobotDFPlayerMini::disableLoop() { send(0x19, 1); }
void DFRobotDFPlayerMini::enableDAC() { send(0x1A, 0); }
void DFRobotDFPlayerMini::disableDAC() { send(0x1A, 1); }

int DFRobotDFPlayerMini::readState() {
  int state = query(0x42);
  return state < 0 ? -1 : state & 0xFF;
}
int DFRobotDFPlayerMini::readVolume() { return query(0x43); }
int DFRobotDFPlayerMini::readEQ() { return query(0x44); }
int DFRobotDFPlayerMini::readFileCounts(uint8_t device) {
  return query(device == DFPLAYER_DEVICE_U_DISK ? 0x47 : 0x48);
}
int DFRobotDFPlayerMini::readFileCounts() { return readFileCounts(DFPLAYER_DEVICE_SD); }
int DFRobotDFPlayerMini::readCurrentFileNumber(uint8_t device) {
  return query(device == DFPLAYER_DEVICE_U_DISK ? 0x4B : 0x4C);
}
int DFRobotDFPlayerMini::readCurrentFileNumber() {
  return readCurrentFileNumber(DFPLAYER_DEVICE_SD);
}
int DFRobotDFPlayerMini::readFileCountsInFolder(int folderNumber) {
  return query(0x4E, (uint16_t)folderNumber);
}
int DFRobotDFPlayerMini::readFolderCounts() { return query(0x4F); }
