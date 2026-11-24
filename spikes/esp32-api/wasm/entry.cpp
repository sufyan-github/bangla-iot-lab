// The start of a sketch built as a WebAssembly module. The world is not in the
// module: every host_* function is an import, answered by whoever loads it.
//
// The loader calls _initialize() once (it runs the sketch's global
// constructors), then run(). run() never returns; the loader ends it by
// throwing from an import when the time it wants to simulate is up.
#include "Arduino.h"

extern "C" __attribute__((export_name("run"))) void run() {
  setup();
  for (;;) {
    loop();
    host_tick();
    lab_poll();
  }
}

// The module is built without C++ exceptions, but the precompiled standard
// library still refers to the two functions that raise one (for a string that
// cannot grow, for instance). Raising one stops the sketch.
extern "C" void* __cxa_allocate_exception(size_t) { abort(); }
extern "C" void __cxa_throw(void*, void*, void (*)(void*)) { abort(); }
// Likewise the function called when a class's missing function is reached (Print's
// write, before a display or port supplies it). The standard library's own version
// prints a message, which would bring its whole formatted-output code into every sketch.
extern "C" void __cxa_pure_virtual() { abort(); }
