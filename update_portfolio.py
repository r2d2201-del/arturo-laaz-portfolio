# -*- coding: utf-8 -*-
import os
import re
import shutil

# Configuración de directorios
PREVIEWS_DIR = os.path.join('assets', 'previews')
VIDEOS_DIR = os.path.join('assets', 'videos')
HTML_FILE = 'index.html'
BACKUP_FILE = 'index.html.bak'

# Mapeo de prefijos a categorías del sitio web
CATEGORY_MAPPING = {
    'REEL': ('vertical', 'Verticales / Reels', 'fa-eye'),
    'VERTICAL': ('vertical', 'Verticales / Reels', 'fa-eye'),
    'UGC': ('ugc-ads', 'UGC & Ads', 'fa-chart-line'),
    'AD': ('ugc-ads', 'UGC & Ads', 'fa-chart-line'),
    'ANUNCIO': ('ugc-ads', 'UGC & Ads', 'fa-chart-line'),
    'MOTION': ('motion-graphics', 'Motion Graphics', 'fa-wand-magic-sparkles'),
    'MOTION G': ('motion-graphics', 'Motion Graphics', 'fa-wand-magic-sparkles'),
    'YOUTUBE': ('youtube', 'YouTube / Horizontales', 'fa-users'),
}

def is_youtube_id(s):
    """Verifica si un string tiene el formato típico de un ID de YouTube (11 caracteres, sin espacios)."""
    if len(s) != 11:
        return False
    return re.match(r'^[a-zA-Z0-9_-]{11}$', s) is not None

def parse_filename(filename):
    """
    Analiza el nombre del archivo para extraer metadatos del video.
    Formatos soportados:
    - [ORDEN]__[CATEGORÍA]__[TÍTULO]__[MÉTRICA]__previews.mp4
    - [ORDEN]__YOUTUBE__[ID_YOUTUBE]__[TÍTULO]__[MÉTRICA]__previews.mp4
    Y fallbacks con guion simple (_) si no se encuentra __
    """
    # Eliminar extensión .mp4
    name, _ = os.path.splitext(filename)
    
    # Quitar sufijo de preview si existe
    for suffix in ['__previews', '_previews']:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
            break
            
    sort_order = 999
    # Extraer el orden numérico inicial si existe (ej: "01_" o "01__") antes de dividir el resto
    order_match = re.match(r'^(\d+)(?:__|_)(.*)$', name)
    if order_match:
        sort_order = int(order_match.group(1))
        name = order_match.group(2)
        
    # Determinar el separador (doble guion bajo es el preferido, simple es el fallback)
    if '__' in name:
        parts = name.split('__')
    else:
        parts = name.split('_')
        
    # Limpiar espacios en los elementos
    parts = [p.strip() for p in parts if p.strip()]
        
    if not parts:
        return sort_order, 'vertical', 'Verticales / Reels', 'Video sin título', 'Ver Video', None, 'fa-eye'
        
    category_raw = parts[0].upper()
    
    # Determinar clave de categoría
    category_key = 'REEL'
    if category_raw.startswith('REEL') or category_raw.startswith('VERT'):
        category_key = 'REEL'
    elif category_raw.startswith('UGC'):
        category_key = 'UGC'
    elif category_raw.startswith('AD') or category_raw.startswith('ANUNCIO'):
        category_key = 'AD'
    elif category_raw.startswith('MOTION'):
        category_key = 'MOTION'
    elif category_raw.startswith('YOUTUBE') or category_raw.startswith('YT'):
        category_key = 'YOUTUBE'
    else:
        # Intenta adivinar basándose en otras palabras o por defecto vertical
        category_key = 'REEL'
        
    cat_code, cat_title, cat_icon = CATEGORY_MAPPING[category_key]
    
    youtube_id = None
    title = ""
    stat = ""
    
    if category_key == 'YOUTUBE':
        # Caso especial YouTube: YOUTUBE__[ID_YT]__[TÍTULO]__[MÉTRICA]
        # Validar si el segundo elemento es un ID de YouTube
        if len(parts) >= 2 and is_youtube_id(parts[1]):
            youtube_id = parts[1]
            if len(parts) >= 4:
                title = parts[2]
                stat = parts[3]
            elif len(parts) == 3:
                title = parts[2]
                stat = 'Ver en YouTube'
            else:
                title = 'Video de YouTube'
                stat = 'Ver en YouTube'
        else:
            # Si el segundo elemento no es un ID, es el título directo
            youtube_id = 'dQw4w9WgXcQ'  # ID por defecto (rickroll de prueba)
            if len(parts) >= 3:
                title = ' '.join(parts[1:-1])
                stat = parts[-1]
            elif len(parts) == 2:
                title = parts[1]
                stat = 'Ver en YouTube'
            else:
                title = 'Video de YouTube'
                stat = 'Ver en YouTube'
    else:
        # Videos locales estándares
        if len(parts) >= 3:
            title = ' '.join(parts[1:-1])
            stat = parts[-1]
        elif len(parts) == 2:
            title = parts[1]
            stat = 'Ver Video'
        else:
            title = parts[0]
            stat = 'Ver Video'
            
    # Limpiar títulos y estadísticas redundantes o numéricas
    if stat.isdigit() or stat.lower() in ['previews', '1', '2', '3', 'final', 'v2', 'v1', 'version_1_1']:
        stat = 'Edición de Alto Impacto' if cat_code == 'ugc-ads' else 'Ver Video'
        
    # Reemplazar guiones bajos y guiones en el título por espacios y formatear
    title = title.replace('_', ' ').replace('-', ' ').strip()
    title = re.sub(r'\s+', ' ', title)
    
    # Capitalización elegante (primera letra de palabras importantes)
    # Por simplicidad, capitalizamos la primera letra y mantenemos siglas si están en mayúsculas
    if title:
        title = title[0].upper() + title[1:]
        
    return sort_order, cat_code, cat_title, title, stat, youtube_id, cat_icon

def generate_card_html(filename, metadata):
    sort_order, cat_code, cat_title, title, stat, youtube_id, cat_icon = metadata
    
    # Buscar si existe el video original completo en assets/videos/
    # El video completo debería llamarse igual que el preview pero sin la parte de _previews
    base_name, _ = os.path.splitext(filename)
    
    # Quitar sufijo de preview
    for suffix in ['__previews', '_previews']:
        if base_name.endswith(suffix):
            base_name = base_name[:-len(suffix)]
            break
            
    # Intentar varias opciones para el video original
    video_options = [
        base_name + '.mp4',
    ]
    
    # Si base_name empieza con un número de orden (ej: "01_" o "01__"), añadir opción sin el número
    clean_base_match = re.match(r'^(\d+)(?:__|_)(.*)$', base_name)
    if clean_base_match:
        video_options.append(clean_base_match.group(2) + '.mp4')
        
    # Si el nombre termina en _1, _2, _version_1 etc., añadir la opción sin este índice numérico
    # Hacemos esto para cada opción actual de la lista
    extra_options = []
    for opt in video_options:
        opt_base, _ = os.path.splitext(opt)
        if opt_base.endswith('_1'):
            extra_options.append(opt_base[:-2] + '.mp4')
        elif opt_base.endswith('__1'):
            extra_options.append(opt_base[:-3] + '.mp4')
            
    video_options.extend(extra_options)
        
    matching_video = None
    for opt in video_options:
        opt_path = os.path.join(VIDEOS_DIR, opt)
        if os.path.exists(opt_path):
            matching_video = opt
            break
            
    has_full_video = matching_video is not None
    
    # Clases HTML
    card_classes = ["portfolio-card"]
    if cat_code == 'youtube':
        card_classes.append("horizontal-ratio")
        
    class_str = " ".join(card_classes)
    
    # Atributos de datos
    data_attrs = [f'data-category="{cat_code}"']
    if youtube_id:
        data_attrs.append(f'data-youtube-id="{youtube_id}"')
    if has_full_video:
        data_attrs.append(f'data-full-video="assets/videos/{matching_video}"')
        
    data_str = " ".join(data_attrs)
    preview_path = f"assets/previews/{filename}"
    
    # Template HTML
    html = f"""                <!-- Item: {title} -->
                <div class="{class_str}" {data_str}>
                    <div class="card-media">
                        <div class="video-container-card">
                            <video class="card-video-preview" loop muted playsinline preload="metadata">
                                <source src="{preview_path}#t=0.001" type="video/mp4">
                            </video>
                        </div>
                        <div class="card-overlay">
                            <span class="play-icon"><i class="fa-solid fa-play"></i></span>
                        </div>
                    </div>
                    <div class="card-info">
                        <span class="card-category">{cat_title}</span>
                        <h3 class="card-title">{title}</h3>
                        <div class="card-metric"><i class="fa-solid {cat_icon}"></i> {stat}</div>
                    </div>
                </div>\n"""
    return html

def main():
    print("==================================================")
    print("  Actualizador Automático de Portafolio de Videos  ")
    print("==================================================")
    
    if not os.path.exists(PREVIEWS_DIR):
        print(f"ERROR: No se encuentra el directorio de vistas previas: {PREVIEWS_DIR}")
        return
        
    print(f"Escaneando videos en: {PREVIEWS_DIR}")
    
    # Listar todos los archivos de vistas previas
    all_files = [f for f in os.listdir(PREVIEWS_DIR) if f.endswith('.mp4')]
    
    if not all_files:
        print("No se encontraron archivos .mp4 en la carpeta assets/previews.")
        return
        
    # Filtrar el archivo del Header (Hero) de las tarjetas del portafolio
    preview_files = []
    hero_file = None
    
    for f in all_files:
        if f.upper().startswith('HERO'):
            hero_file = f
        else:
            preview_files.append(f)
            
    parsed_videos = []
    for f in preview_files:
        meta = parse_filename(f)
        parsed_videos.append((f, meta))
        
    # Ordenar por el número de orden asignado (sort_order) y luego por el nombre del archivo
    parsed_videos.sort(key=lambda x: (x[1][0], x[0]))
    
    print(f"Se encontraron {len(parsed_videos)} videos para la grilla del portafolio.")
    if hero_file:
        print(f"Se detectó un video para el Header (Hero): {hero_file}")
    
    # Generar bloques HTML para las tarjetas del portafolio
    cards_html_list = []
    for filename, meta in parsed_videos:
        card_html = generate_card_html(filename, meta)
        cards_html_list.append(card_html)
        print(f" -> [{meta[1].upper()}] {meta[3]} ({meta[4]})")
        
    grid_content = "\n" + "".join(cards_html_list) + "                "
    
    # Modificar index.html usando los comentarios de anclaje
    if not os.path.exists(HTML_FILE):
        print(f"ERROR: No se encuentra el archivo {HTML_FILE}")
        return
        
    # Hacer copia de seguridad primero
    print(f"Creando copia de seguridad: {BACKUP_FILE}")
    shutil.copyfile(HTML_FILE, BACKUP_FILE)
    
    with open(HTML_FILE, 'r', encoding='utf-8') as file:
        html_content = file.read()
        
    # 1. Modificar el video e información del Hero (si existe un archivo HERO)
    if hero_file:
        print(f"Actualizando video del Header con: {hero_file}")
        h_name, _ = os.path.splitext(hero_file)
        
        # Quitar sufijo de preview
        for suffix in ['__previews', '_previews']:
            if h_name.endswith(suffix):
                h_name = h_name[:-len(suffix)]
                break
                
        # Separar metadatos
        if '__' in h_name:
            h_parts = h_name.split('__')
        else:
            h_parts = h_name.split('_')
            
        h_parts = [p.strip() for p in h_parts if p.strip()]
        
        badge = h_parts[1] if len(h_parts) >= 2 else "Alto Impacto"
        title = h_parts[2] if len(h_parts) >= 3 else "Formatos UGC & Redes"
        subtitle = h_parts[3] if len(h_parts) >= 4 else "Captura la atención en los primeros 3 segundos"
        
        # Limpiar guiones
        title = title.replace('_', ' ').replace('-', ' ').strip()
        subtitle = subtitle.replace('_', ' ').replace('-', ' ').strip()
        
        hero_video_start = '<!-- HERO_VIDEO_START -->'
        hero_video_end = '<!-- HERO_VIDEO_END -->'
        hero_info_start = '<!-- HERO_INFO_START -->'
        hero_info_end = '<!-- HERO_INFO_END -->'
        
        hv_start_idx = html_content.find(hero_video_start)
        hv_end_idx = html_content.find(hero_video_end)
        hi_start_idx = html_content.find(hero_info_start)
        hi_end_idx = html_content.find(hero_info_end)
        
        if hv_start_idx != -1 and hv_end_idx != -1:
            new_source_html = f'\n                                <source src="assets/previews/{hero_file}#t=0.001" type="video/mp4">\n                                '
            html_content = (
                html_content[:hv_start_idx + len(hero_video_start)] +
                new_source_html +
                html_content[hv_end_idx:]
            )
            # Recalcular posiciones del info
            hi_start_idx = html_content.find(hero_info_start)
            hi_end_idx = html_content.find(hero_info_end)
            
        if hi_start_idx != -1 and hi_end_idx != -1:
            new_info_html = f"""\n                                <div class="badge"><i class="fa-solid fa-bolt"></i> {badge}</div>
                                <h3>{title}</h3>
                                <p>{subtitle}</p>\n                                """
            html_content = (
                html_content[:hi_start_idx + len(hero_info_start)] +
                new_info_html +
                html_content[hi_end_idx:]
            )
            
    # 2. Modificar las tarjetas del portafolio (Grid)
    start_tag = '<!-- PORTFOLIO_GRID_ITEMS_START -->'
    end_tag = '<!-- PORTFOLIO_GRID_ITEMS_END -->'
    
    start_idx = html_content.find(start_tag)
    end_idx = html_content.find(end_tag)
    
    if start_idx == -1 or end_idx == -1:
        print("ERROR: No se encontraron los comentarios de anclaje en index.html.")
        print(f"Asegúrate de que '{start_tag}' y '{end_tag}' estén en index.html.")
        return
        
    new_html_content = (
        html_content[:start_idx + len(start_tag)] +
        grid_content +
        html_content[end_idx:]
    )
    
    with open(HTML_FILE, 'w', encoding='utf-8') as file:
        file.write(new_html_content)
        
    print("--------------------------------------------------")
    print(f"¡ÉXITO! Se actualizaron {len(parsed_videos)} tarjetas y la sección Hero en {HTML_FILE}.")
    print("==================================================")

if __name__ == '__main__':
    main()
