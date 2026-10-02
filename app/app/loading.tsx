import NeutralLoading from '@/components/NeutralLoading';

/* Every account page paints this the instant a navigation starts, instead of
   holding the previous page on screen with no sign anything is happening. */
export default function Loading() {
  return <NeutralLoading />;
}
