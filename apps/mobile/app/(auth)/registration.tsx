import { CompleteRegistrationScreen } from '../../src/components/CompleteRegistrationScreen';

/**
 * Routed to by the root layout, not navigated to directly — anyone signed in
 * without a completed admission form lands here before anything else, and
 * never reaches this route again once it's submitted.
 */
export default function RegistrationRoute() {
  return <CompleteRegistrationScreen />;
}
