// The DFPlayer Mini MP3 player, for the lab's board library.
//
// The same class, functions and names as DFRobot's DFRobotDFPlayerMini library
// for Arduino, so that sketches written for it build and run unchanged. This is
// the lab's own implementation, written from the serial message format in
// DFRobot's manual for the module; DFRobotDFPlayerMini itself is under the LGPL
// and is not used.
//
// Each message is ten bytes: 7Eh, FFh, 06h, the command, whether an
// acknowledgement is wanted, a 16-bit parameter, a 16-bit checksum and EFh.
#pragma once
#include <Arduino.h>

#define DFPLAYER_EQ_NORMAL 0
#define DFPLAYER_EQ_POP 1
#define DFPLAYER_EQ_ROCK 2
#define DFPLAYER_EQ_JAZZ 3
#define DFPLAYER_EQ_CLASSIC 4
#define DFPLAYER_EQ_BASS 5

#define DFPLAYER_DEVICE_U_DISK 1
#define DFPLAYER_DEVICE_SD 2
#define DFPLAYER_DEVICE_AUX 3
#define DFPLAYER_DEVICE_SLEEP 4
#define DFPLAYER_DEVICE_FLASH 5

// What readType() says arrived.
#define TimeOut 0
#define WrongStack 1
#define DFPlayerCardInserted 2
#define DFPlayerCardRemoved 3
#define DFPlayerCardOnline 4
#define DFPlayerPlayFinished 5
#define DFPlayerError 6
#define DFPlayerUSBInserted 7
#define DFPlayerUSBRemoved 8
#define DFPlayerUSBOnline 9
#define DFPlayerCardUSBOnline 10
#define DFPlayerFeedBack 11

// What read() gives after DFPlayerError.
#define Busy 1
#define Sleeping 2
#define SerialWrongStack 3
#define CheckSumNotMatch 4
#define FileIndexOut 5
#define FileMismatch 6
#define Advertise 7

class DFRobotDFPlayerMini {
 public:
  /** Starts talking to the player; with `doReset`, restarts it and waits until its card is read. */
  bool begin(Stream& stream, bool isACK = true, bool doReset = true);
  void setTimeOut(unsigned long timeOutDuration) { timeOut_ = timeOutDuration; }

  /** True when the player has said something: a track finished, an error, a card. */
  bool available();
  uint8_t readType() { return type_; }
  uint16_t read() { return parameter_; }
  uint8_t readCommand() { return command_; }

  void next();
  void previous();
  void play(int fileNumber = 1);
  void volumeUp();
  void volumeDown();
  void volume(uint8_t volume);
  void EQ(uint8_t eq);
  void loop(int fileNumber);
  void outputDevice(uint8_t device);
  void sleep();
  void reset();
  void start();
  void pause();
  void playFolder(uint8_t folderNumber, uint8_t fileNumber);
  void outputSetting(bool enable, uint8_t gain);
  void enableLoopAll();
  void disableLoopAll();
  void playMp3Folder(int fileNumber);
  void advertise(int fileNumber);
  void playLargeFolder(uint8_t folderNumber, uint16_t fileNumber);
  void stopAdvertise();
  void stop();
  void loopFolder(int folderNumber);
  void randomAll();
  void enableLoop();
  void disableLoop();
  void enableDAC();
  void disableDAC();

  int readState();
  int readVolume();
  int readEQ();
  int readFileCounts(uint8_t device);
  int readFileCounts();
  int readCurrentFileNumber(uint8_t device);
  int readCurrentFileNumber();
  int readFileCountsInFolder(int folderNumber);
  int readFolderCounts();

 private:
  void send(uint8_t command, uint16_t parameter = 0);
  /** Reads what has arrived; true once a whole message is in. */
  bool receive();
  /** Waits up to the time-out for a message; true when one came. */
  bool wait();
  /** Sends a query and returns its answer, or -1. */
  int query(uint8_t command, uint16_t parameter = 0);
  /** Sorts a message into what readType() and read() give. */
  void sort();

  Stream* stream_ = nullptr;
  bool ack_ = true;
  unsigned long timeOut_ = 500;
  uint8_t in_[10] = {};
  uint8_t count_ = 0;
  uint8_t type_ = TimeOut;
  uint8_t command_ = 0;
  uint16_t parameter_ = 0;
  bool pending_ = false;
};
