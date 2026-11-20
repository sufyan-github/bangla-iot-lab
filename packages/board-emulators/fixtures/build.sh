#!/usr/bin/env bash
# Rebuilds the firmware fixtures. Requires avr-gcc and avr-libc.
set -euo pipefail
cd "$(dirname "$0")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os -std=gnu11 -Wall -o "$tmp/blink.elf" blink.c
avr-objcopy -O ihex -R .eeprom "$tmp/blink.elf" blink.hex
avr-size "$tmp/blink.elf"
