# agents/adam/handoffs/

This directory is Adam's approved processing queue.

## Who writes here
Odin only. This is the output of Odin's memory gatekeeper role.

## Who reads here
Adam only. Adam reads each file, produces a KB document, then moves the processed
handoff to handoffs/processed/.

## File format
See ADAM-INTAKE.md for the full handoff file schema.

## File naming
YYYY-MM-DD-TOPIC-SLUG.md

## Status
This directory was created 2026-03-08 as part of Adam's framework activation.
Adam is not yet CLI-registered. Handoffs queued here will be processed on first activation.

## subdirectories
processed/ — completed handoffs (moved here by Adam after KB document is written)
