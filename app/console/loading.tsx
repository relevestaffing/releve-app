import NeutralLoading from '@/components/NeutralLoading';

/* Shared by every console page that has no skeleton of its own. It used to be
   the Overview's exact shape (launcher tiles, Today, the money rail), which
   flashed a dashboard before Billing, Messages or Care. A neutral shape is
   honest on every page; pages with their own loading.tsx (the roster) still
   use theirs. */
export default function Loading() {
  return <NeutralLoading />;
}
