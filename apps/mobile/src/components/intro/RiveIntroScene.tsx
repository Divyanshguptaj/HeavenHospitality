import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Fit, RiveEventType, RiveView, useRive, useRiveFile, type RiveEvent } from '@rive-app/react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro static-asset require, not a CJS import.
const RIVE_SOURCE = require('../../../assets/rive/heaven-intro.riv') as number;
const ARTBOARD_NAME = 'HeavenIntro';
const STATE_MACHINE_NAME = 'Intro';
const COMPLETE_EVENT_NAME = 'introComplete';

/** Plays the "doorway to home" composition and reports when it fires its completion event. */
export function RiveIntroScene({
  onComplete,
  onError,
}: {
  readonly onComplete: () => void;
  readonly onError: () => void;
}) {
  const { riveFile, error } = useRiveFile(RIVE_SOURCE);
  const { riveViewRef, setHybridRef } = useRive();
  const reported = useRef(false);

  useEffect(() => {
    if (error) onError();
  }, [error, onError]);

  useEffect(() => {
    if (riveViewRef === null) onError();
  }, [riveViewRef, onError]);

  useEffect(() => {
    if (!riveViewRef) return;
    riveViewRef.onEventListener((event: RiveEvent) => {
      if (event.type === RiveEventType.General && event.name === COMPLETE_EVENT_NAME && !reported.current) {
        reported.current = true;
        onComplete();
      }
    });
    return () => riveViewRef.removeEventListeners();
  }, [riveViewRef, onComplete]);

  if (!riveFile) return null;

  return (
    <RiveView
      file={riveFile}
      artboardName={ARTBOARD_NAME}
      stateMachineName={STATE_MACHINE_NAME}
      autoPlay
      fit={Fit.Cover}
      hybridRef={setHybridRef}
      onError={(riveError) => {
        console.warn(`[Rive] ${riveError.message}`);
        onError();
      }}
      style={StyleSheet.absoluteFillObject}
    />
  );
}
