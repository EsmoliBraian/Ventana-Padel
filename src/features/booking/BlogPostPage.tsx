import { Link, useParams } from 'react-router-dom'
import { useSlidesStore } from '@/store/slidesStore'
import { useVenuePath } from '@/lib/venuePath'

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BlogPostPage() {
  const { id } = useParams()
  const path = useVenuePath()
  const post = useSlidesStore((s) => s.slides).find((s) => s.id === id && s.published)

  if (!post) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="text-lg text-gray-200">No encontramos este post.</p>
        <Link to={path('/blog')} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-500 hover:underline">
          <ArrowLeftIcon /> Volver al blog
        </Link>
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <Link
        to={path('/blog')}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
      >
        <ArrowLeftIcon /> Volver al blog
      </Link>

      {post.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-gray-925">
          <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-500">
        Blog
      </p>
      <h1 className="mt-1 text-3xl font-semibold text-gray-50 sm:text-4xl">{post.title}</h1>
      {post.subtitle && <p className="mt-3 text-lg text-gray-300">{post.subtitle}</p>}

      {post.body ? (
        <div className="mt-6 whitespace-pre-line text-base leading-relaxed text-gray-400">
          {post.body}
        </div>
      ) : (
        <p className="mt-6 text-base text-gray-500">Todavia no hay mas contenido para este post.</p>
      )}

      <Link
        to={path('/reservar')}
        className="mt-10 inline-flex rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-gray-950 hover:bg-primary-400"
      >
        Reservar cancha
      </Link>
    </article>
  )
}
