#!/usr/bin/env python3
"""regen macOS Finder background (req macOS PyObjC)."""
import sys
from AppKit import (
    NSBitmapImageFileTypePNG, NSBitmapImageRep, NSCalibratedRGBColorSpace,
    NSColor, NSGraphicsContext, NSImage, NSMakeRect, NSGradient,
)

WIDTH, HEIGHT = 760, 460
icon_path, output_path = sys.argv[1:3]
bitmap = NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
    None, WIDTH, HEIGHT, 8, 4, True, False, NSCalibratedRGBColorSpace, 0, 0
)
context = NSGraphicsContext.graphicsContextWithBitmapImageRep_(bitmap)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.setCurrentContext_(context)

gradient = NSGradient.alloc().initWithStartingColor_endingColor_(
    NSColor.colorWithCalibratedRed_green_blue_alpha_(0.91, 0.95, 0.99, 1),
    NSColor.colorWithCalibratedRed_green_blue_alpha_(0.82, 0.89, 0.96, 1),
)
gradient.drawInRect_angle_(NSMakeRect(0, 0, WIDTH, HEIGHT), 315)

icon = NSImage.alloc().initWithContentsOfFile_(icon_path)
if icon:
    icon.drawInRect_fromRect_operation_fraction_(NSMakeRect(42, 376, 38, 38), NSMakeRect(0, 0, icon.size().width, icon.size().height), 2, 1)

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
png = bitmap.representationUsingType_properties_(NSBitmapImageFileTypePNG, {})
if not png.writeToFile_atomically_(output_path, True):
    raise SystemExit(f'Could not write DMG background: {output_path}')
