import { createFileRoute, redirect } from '@tanstack/react-router'

// The lender check is now part of the one check screen; old links and bookmarks land there.
export const Route = createFileRoute('/_app/pemberi')({ beforeLoad: () => { throw redirect({ to: '/semak', replace: true }) } })
