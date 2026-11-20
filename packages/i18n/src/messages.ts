/**
 * Interface text. Bangla is the primary language; English is shown on request
 * and alongside technical terms. Students are addressed as "তুমি".
 *
 * `{name}` marks a value filled in at run time.
 */
export const bn = {
  'app.name': 'বাংলা IoT ল্যাব',
  'app.tagline': 'নিজের হাতে সার্কিট বানাও, চালিয়ে দেখো',
  'nav.projects': 'আমার সার্কিট',
  'nav.bench': 'আরডুইনো পরীক্ষা',
  'nav.language': 'English',
  'status.offline': 'অফলাইন — কাজ এই ডিভাইসেই সেভ হচ্ছে',
  'status.updateReady': 'অফলাইনে ব্যবহারের জন্য প্রস্তুত',

  'home.title': 'আমার সার্কিট',
  'home.intro':
    'এখানে তোমার বানানো সার্কিটগুলো থাকে। সবকিছু এই ডিভাইসেই সেভ হয়, তাই ইন্টারনেট ছাড়াও খুলতে পারবে।',
  'home.new': 'নতুন সার্কিট',
  'home.example': 'উদাহরণ খোলো: LED জ্বালাও',
  'home.empty.title': 'এখনও কোনো সার্কিট নেই',
  'home.empty.body': 'প্রথমে উদাহরণটা খুলে দেখো LED কীভাবে জ্বলে, তারপর নিজে একটা বানাও।',
  'home.open': 'খোলো',
  'home.delete': 'মুছে ফেলো',
  'home.deleteConfirm': '“{name}” মুছে ফেলবে? এটা আর ফেরত আনা যাবে না।',
  'home.parts': '{count}টি যন্ত্রাংশ',
  'home.updated': 'শেষ পরিবর্তন {time}',
  'home.untitled': 'নামহীন সার্কিট',
  'home.exampleName': 'আমার প্রথম LED সার্কিট',
  'home.storageError': 'এই ব্রাউজারে সেভ করা যাচ্ছে না। প্রাইভেট মোড বন্ধ করে আবার চেষ্টা করো।',

  'lab.back': 'সব সার্কিট',
  'lab.nameLabel': 'সার্কিটের নাম',
  'lab.run': 'চালু করো',
  'lab.stop': 'বন্ধ করো',
  'lab.saved': 'সেভ হয়েছে',
  'lab.saving': 'সেভ হচ্ছে…',
  'lab.saveError': 'সেভ হয়নি',
  'lab.notFound': 'এই সার্কিটটা এই ডিভাইসে পাওয়া যায়নি।',
  'lab.loading': 'সার্কিট খোলা হচ্ছে…',
  'lab.zoomIn': 'বড় করো',
  'lab.zoomOut': 'ছোট করো',
  'lab.canvasLabel': 'ব্রেডবোর্ড',

  'tool.select': 'বাছাই',
  'tool.wire': 'তার',
  'tool.battery': 'ব্যাটারি',
  'tool.resistor': 'রেজিস্টর',
  'tool.led': 'LED',
  'hint.select': 'কোনো যন্ত্রাংশে ট্যাপ করে বাছাই করো। টেনে সরানো যায়, পায়ের গোল বিন্দু টেনে পা সরানো যায়।',
  'hint.wire.start': 'তারের প্রথম মাথা কোথায় বসবে? একটা ছিদ্রে বা ব্যাটারির প্রান্তে ট্যাপ করো।',
  'hint.wire.end': 'এবার দ্বিতীয় মাথার জায়গায় ট্যাপ করো।',
  'hint.resistor': 'রেজিস্টর বসাতে বোর্ডের একটা ছিদ্রে ট্যাপ করো।',
  'hint.led': 'LED বসাতে একটা ছিদ্রে ট্যাপ করো। যেখানে ট্যাপ করবে সেখানে লম্বা পা (+) বসবে।',

  'part.battery': 'ব্যাটারি',
  'part.resistor': 'রেজিস্টর',
  'part.led': 'LED',
  'part.wire': 'তার',
  'part.battery.about':
    'ব্যাটারি সার্কিটে শক্তি জোগায়। কারেন্ট + প্রান্ত থেকে বেরিয়ে সার্কিট ঘুরে − প্রান্তে ফিরে আসে।',
  'part.resistor.about':
    'রেজিস্টর কারেন্টকে বাধা দেয়। মান যত বেশি, কারেন্ট তত কম। LED-কে বাঁচাতে এটা দরকার। গায়ের রঙিন দাগ দেখে মান পড়া যায়।',
  'part.led.about':
    'LED-র ভেতর দিয়ে ঠিক দিকে কারেন্ট গেলে আলো জ্বলে। লম্বা পা অ্যানোড (+), ছোট পা ক্যাথোড (−)।',
  'part.wire.about': 'তার দুটো জায়গাকে জুড়ে দেয়, যাতে কারেন্ট এক জায়গা থেকে আরেক জায়গায় যেতে পারে।',

  'inspector.title': 'বাছাই করা যন্ত্রাংশ',
  'inspector.none': 'কোনো যন্ত্রাংশ বাছাই করা নেই। বোর্ডের কোনো যন্ত্রাংশে ট্যাপ করো।',
  'inspector.voltage': 'ভোল্টেজ',
  'inspector.resistance': 'রোধের মান',
  'inspector.color': 'রং',
  'inspector.flip': 'পা উল্টে দাও',
  'inspector.remove': 'সরিয়ে ফেলো',
  'color.red': 'লাল',
  'color.yellow': 'হলুদ',
  'color.green': 'সবুজ',
  'color.blue': 'নীল',
  'color.white': 'সাদা',

  'meter.title': 'মিটার',
  'meter.idle': 'মাপ দেখতে সার্কিট চালু করো।',
  'meter.voltage': 'ভোল্টেজ',
  'meter.current': 'কারেন্ট',
  'meter.power': 'ক্ষমতা',
  'meter.part': 'যন্ত্রাংশ',

  'messages.title': 'সার্কিটে কী ঘটছে',
  'messages.idle': 'সার্কিট বন্ধ আছে।',
  'diag.led-on': 'LED জ্বলছে! পথ সম্পূর্ণ হয়েছে, তাই কারেন্ট বইছে।',
  'diag.all-good': 'সার্কিট চলছে, কোনো সমস্যা নেই।',
  'diag.no-battery': 'সার্কিটে ব্যাটারি নেই। ব্যাটারি ছাড়া কারেন্ট বইবে না।',
  'diag.open-circuit':
    'কারেন্ট বইছে না। ব্যাটারির + থেকে − পর্যন্ত পথটা কোথাও খোলা আছে। তারগুলো মিলিয়ে দেখো।',
  'diag.short-circuit':
    'শর্ট সার্কিট! ব্যাটারির + আর − প্রায় সরাসরি জুড়ে গেছে। আসল ব্যাটারি হলে গরম হয়ে নষ্ট হতো। যে তারটা সরাসরি জুড়ছে সেটা সরাও।',
  'diag.led-reversed':
    '{id} উল্টো লাগানো। LED শুধু এক দিকে কারেন্ট যেতে দেয়। লম্বা পা (+) ব্যাটারির + দিকে রাখো।',
  'diag.led-overcurrent':
    '{id}-এ বেশি কারেন্ট যাচ্ছে ({current})। ২০ mA-র কাছাকাছি রাখা ভালো। আরও বড় মানের রেজিস্টর লাগাও।',
  'diag.led-burned':
    '{id} পুড়ে গেছে! এত কারেন্ট ({current}) LED সইতে পারে না। সাথে উপযুক্ত রেজিস্টর লাগাও।',
  'diag.legs-in-same-strip':
    '{id}-এর দুই পা একই সারিতে। বোর্ডের ভেতরে ওই পাঁচটা ছিদ্র জোড়া, তাই কারেন্ট একে পাশ কাটিয়ে যায়। একটা পা অন্য কলামে নাও।',
  'diag.solver-failed': 'এই সার্কিটটা হিসাব করা যায়নি। সংযোগগুলো আবার দেখো।',

  'edit.hole-occupied': 'এই ছিদ্রে আগে থেকেই কিছু বসানো আছে।',
  'edit.no-room': 'এখানে জায়গা নেই।',
  'edit.lead-too-long': 'পা এত দূর পৌঁছায় না।',
  'edit.same-point': 'দুই মাথা আলাদা জায়গায় বসাও।',
  'edit.battery-limit': 'সর্বোচ্চ দুটো ব্যাটারি রাখা যায়।',
  'edit.other': 'এটা করা গেল না।',

  'bench.title': 'আরডুইনো পরীক্ষা',
  'bench.intro':
    'এখানে একটা ভার্চুয়াল Arduino UNO-তে প্রোগ্রাম চালিয়ে দেখা যায়। প্রোগ্রামটা বোর্ডের ১৩ নম্বর পিনের LED জ্বালায় আর নেভায়।',
  'bench.code': 'প্রোগ্রাম (C)',
  'bench.runBuiltIn': 'তৈরি প্রোগ্রাম চালাও',
  'bench.compileRun': 'কম্পাইল করে চালাও',
  'bench.stop': 'থামাও',
  'bench.needsInternet': 'কম্পাইল করতে ইন্টারনেট ও সার্ভার লাগে। তৈরি প্রোগ্রামটা অফলাইনেও চলে।',
  'bench.compiling': 'কম্পাইল হচ্ছে…',
  'bench.compilerDown': 'কম্পাইল সার্ভারে পৌঁছানো যাচ্ছে না। পরে আবার চেষ্টা করো।',
  'bench.compileError': 'প্রোগ্রামে ভুল আছে:',
  'bench.line': 'লাইন {line}: {message}',
  'bench.tooLarge': 'প্রোগ্রামটা UNO-র মেমরিতে আঁটছে না।',
  'bench.timeout': 'কম্পাইল করতে বেশি সময় লাগছে। প্রোগ্রাম ছোট করে আবার চেষ্টা করো।',
  'bench.compiled': 'কম্পাইল হয়েছে: {bytes} বাইট',
  'bench.board': 'ভার্চুয়াল UNO',
  'bench.pin13': 'পিন ১৩-র LED',
  'bench.on': 'জ্বলছে',
  'bench.off': 'নেভানো',
  'bench.time': 'বোর্ডের ঘড়ি',
  'bench.serial': 'সিরিয়াল মনিটর',
  'bench.serialEmpty': 'প্রোগ্রাম চালালে বোর্ডের পাঠানো লেখা এখানে দেখাবে।',
  'bench.limit': 'এই ধাপে শুধু ডিজিটাল আউটপুট আর সিরিয়াল লেখা দেখানো হয়।',
} as const;

export type MessageKey = keyof typeof bn;

export const en: Record<MessageKey, string> = {
  'app.name': 'Bangla IoT Lab',
  'app.tagline': 'Build circuits with your own hands and watch them run',
  'nav.projects': 'My circuits',
  'nav.bench': 'Arduino test',
  'nav.language': 'বাংলা',
  'status.offline': 'Offline — your work is saved on this device',
  'status.updateReady': 'Ready to use offline',

  'home.title': 'My circuits',
  'home.intro':
    'The circuits you build are kept here. Everything is saved on this device, so you can open it without internet.',
  'home.new': 'New circuit',
  'home.example': 'Open the example: light an LED',
  'home.empty.title': 'No circuits yet',
  'home.empty.body': 'Open the example first to see how an LED lights up, then build your own.',
  'home.open': 'Open',
  'home.delete': 'Delete',
  'home.deleteConfirm': 'Delete “{name}”? This cannot be undone.',
  'home.parts': '{count} parts',
  'home.updated': 'Last changed {time}',
  'home.untitled': 'Untitled circuit',
  'home.exampleName': 'My first LED circuit',
  'home.storageError': 'This browser cannot save your work. Turn off private mode and try again.',

  'lab.back': 'All circuits',
  'lab.nameLabel': 'Circuit name',
  'lab.run': 'Run',
  'lab.stop': 'Stop',
  'lab.saved': 'Saved',
  'lab.saving': 'Saving…',
  'lab.saveError': 'Not saved',
  'lab.notFound': 'This circuit was not found on this device.',
  'lab.loading': 'Opening circuit…',
  'lab.zoomIn': 'Zoom in',
  'lab.zoomOut': 'Zoom out',
  'lab.canvasLabel': 'Breadboard',

  'tool.select': 'Select',
  'tool.wire': 'Wire',
  'tool.battery': 'Battery',
  'tool.resistor': 'Resistor',
  'tool.led': 'LED',
  'hint.select': 'Tap a part to select it. Drag it to move; drag the round dots to move a leg.',
  'hint.wire.start': 'Where does the wire start? Tap a hole or a battery terminal.',
  'hint.wire.end': 'Now tap where the other end goes.',
  'hint.resistor': 'Tap a hole on the board to place the resistor.',
  'hint.led': 'Tap a hole to place the LED. The long leg (+) goes where you tap.',

  'part.battery': 'Battery',
  'part.resistor': 'Resistor',
  'part.led': 'LED',
  'part.wire': 'Wire',
  'part.battery.about':
    'A battery supplies energy to the circuit. Current leaves the + terminal, goes round the circuit and returns to the − terminal.',
  'part.resistor.about':
    'A resistor opposes current. The higher its value, the smaller the current. It protects the LED. The coloured bands tell you its value.',
  'part.led.about':
    'An LED lights when current flows through it the right way. The long leg is the anode (+), the short leg the cathode (−).',
  'part.wire.about': 'A wire joins two places so current can flow from one to the other.',

  'inspector.title': 'Selected part',
  'inspector.none': 'Nothing selected. Tap a part on the board.',
  'inspector.voltage': 'Voltage',
  'inspector.resistance': 'Resistance',
  'inspector.color': 'Colour',
  'inspector.flip': 'Swap the legs',
  'inspector.remove': 'Remove',
  'color.red': 'Red',
  'color.yellow': 'Yellow',
  'color.green': 'Green',
  'color.blue': 'Blue',
  'color.white': 'White',

  'meter.title': 'Meter',
  'meter.idle': 'Run the circuit to see measurements.',
  'meter.voltage': 'Voltage',
  'meter.current': 'Current',
  'meter.power': 'Power',
  'meter.part': 'Part',

  'messages.title': 'What the circuit is doing',
  'messages.idle': 'The circuit is switched off.',
  'diag.led-on': 'The LED is lit! The path is complete, so current is flowing.',
  'diag.all-good': 'The circuit is running with no problems.',
  'diag.no-battery': 'There is no battery in the circuit. Without one, no current flows.',
  'diag.open-circuit':
    'No current is flowing. The path from battery + to − is open somewhere. Check the wires.',
  'diag.short-circuit':
    'Short circuit! Battery + and − are joined almost directly. A real battery would heat up and be damaged. Remove the wire that joins them.',
  'diag.led-reversed':
    '{id} is the wrong way round. An LED lets current through one way only. Put the long leg (+) towards battery +.',
  'diag.led-overcurrent':
    'Too much current through {id} ({current}). Keep it near 20 mA: use a larger resistor.',
  'diag.led-burned':
    '{id} has burned out! An LED cannot survive this much current ({current}). Add a suitable resistor.',
  'diag.legs-in-same-strip':
    'Both legs of {id} are in the same row of five. Those holes are joined inside the board, so current bypasses the part. Move one leg to another column.',
  'diag.solver-failed': 'This circuit could not be calculated. Check the connections again.',

  'edit.hole-occupied': 'Something is already in this hole.',
  'edit.no-room': 'There is no room here.',
  'edit.lead-too-long': 'The leg cannot reach that far.',
  'edit.same-point': 'Put the two ends in different places.',
  'edit.battery-limit': 'You can have at most two batteries.',
  'edit.other': 'That could not be done.',

  'bench.title': 'Arduino test',
  'bench.intro':
    'Run a program on a virtual Arduino UNO. This one switches the LED on pin 13 on and off.',
  'bench.code': 'Program (C)',
  'bench.runBuiltIn': 'Run the ready-made program',
  'bench.compileRun': 'Compile and run',
  'bench.stop': 'Stop',
  'bench.needsInternet':
    'Compiling needs internet and the server. The ready-made program also runs offline.',
  'bench.compiling': 'Compiling…',
  'bench.compilerDown': 'The compile server cannot be reached. Try again later.',
  'bench.compileError': 'The program has errors:',
  'bench.line': 'Line {line}: {message}',
  'bench.tooLarge': 'The program does not fit in the UNO’s memory.',
  'bench.timeout': 'Compiling is taking too long. Make the program smaller and try again.',
  'bench.compiled': 'Compiled: {bytes} bytes',
  'bench.board': 'Virtual UNO',
  'bench.pin13': 'Pin 13 LED',
  'bench.on': 'On',
  'bench.off': 'Off',
  'bench.time': 'Board clock',
  'bench.serial': 'Serial monitor',
  'bench.serialEmpty': 'Text the board sends will appear here when the program runs.',
  'bench.limit': 'This stage shows digital output and serial text only.',
};
