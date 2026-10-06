import { Link } from 'react-router-dom'
import { useVenuePath } from '@/lib/venuePath'
import type { HeroSlide } from '@/types'

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BlogPostCard({ post }: { post: HeroSlide }) {
  const path = useVenuePath()
  return (
    <Link
      to={path(`/blog/${post.id}`)}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-card transition-colors hover:border-primary-500/50"
    >
      <div className="aspect-[16/10] w-full shrink-0 overflow-hidden bg-gray-925">
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-700">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M7 9h10M7 13h6" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-base font-semibold text-gray-50">{post.title}</p>
        {post.subtitle && <p className="mt-1 text-sm text-gray-400">{post.subtitle}</p>}
        <span className="mt-4 flex items-center gap-1 text-sm font-medium text-primary-500">
          Leer mas <ArrowIcon />
        </span>
      </div>
    </Link>
  )
}
