[2026-03-12 13:44:17.337] [info]    Received message from 192.168.0.98: DATA STORE "casparcg.config" "<configuration>\n    <paths>\n        <media-path>media/</media-path>\n        <log-path disable=\"false\">log/</log-path>\n        <data-path>data/</data-path>\n        <template-path>media/</template-path>\n    </paths>\n    <lock-clear-phrase>secret</lock-clear-phrase>\n    <channels>\n        <channel>\n            <video-mode>7680x1080</video-mode>\n            <consumers>\n                <screen>\n                    <device>1</device>\n                    <x>0</x><y>0</y>\n                    <width>7680</width><height>1080</height>\n                    <stretch>none</stretch>\n                    <windowed>true</windowed>\n                    <vsync>true</vsync>\n                    <always-on-top>true</always-on-top>\n                    <borderless>true</borderless>\n                </screen>\n            </consumers>\n        </channel>\n        <channel>\n            <video-mode>7680x1080</video-mode>\n            <consumers/>\n        </channel>\n        <channel>\n            <video-mode>1080p5000</video-mode>\n            <consumers>\n                <screen>\n                    <device>2</device>\n                    <x>7680</x><y>0</y>\n                    <width>1920</width><height>1080</height>\n                    <stretch>none</stretch>\n                    <windowed>true</windowed>\n                    <vsync>true</vsync>\n                    <always-on-top>true</always-on-top>\n                    <borderless>false</borderless>\n                </screen>\n            </consumers>\n        </channel>\n        <channel>\n            <video-mode>1080p5000</video-mode>\n            <consumers/>\n        </channel>\n        <channel>\n            <video-mode>1080p5000</video-mode>\n            <consumers>\n                <screen>\n                    <device>3</device>\n                    <x>9600</x><y>0</y>\n                    <width>1920</width><height>1080</height>\n                    <stretch>none</stretch>\n                    <windowed>true</windowed>\n                    <vsync>true</vsync>\n                    <borderless>false</borderless>\n                </screen>\n            </consumers>\n        </channel>\n        <channel>\n            <video-mode>1080p5000</video-mode>\n            <consumers/>\n        </channel>\n    </channels>\n    <video-modes>\n        <video-mode>\n            <id>7680x1080</id>\n            <width>7680</width>\n            <height>1080</height>\n            <time-scale>50000</time-scale>\n            <duration>1000</duration>\n            <cadence>960</cadence>\n        </video-mode>\n    </video-modes>\n    <controllers><tcp><port>5250</port><protocol>AMCP</protocol></tcp>\n    </controllers>\n    <osc><port>5253</port></osc>\n    <amcp><media-server><host>localhost</host><port>8000</port></media-server></amcp>\n    <ndi><auto-load>false</auto-load></ndi>\n    <decklink/>\n    <html><enable-gpu>false</enable-gpu></html>\n</configuration>"\r\n
[2026-03-12 13:44:17.337] [info]    Sent message to 192.168.0.98:202 DATA STORE OK\r\n
[2026-03-12 13:44:17.338] [info]    Received message from 192.168.0.98: RESTART\r\n
[2026-03-12 13:44:17.338] [info]    Sent message to 192.168.0.98:202 RESTART OK\r\n
[2026-03-12 13:44:17.338] [info]    video_channel[1|1728x768] Uninitializing.
[2026-03-12 13:44:17.338] [error]   Exception: /usr/include/boost/asio/basic_socket_acceptor.hpp(1122): Throw in function local_endpoint
[2026-03-12 13:44:17.338] [error]   Dynamic exception type: boost::wrapexcept<boost::system::system_error>
[2026-03-12 13:44:17.338] [error]   std::exception::what: local_endpoint: Bad file descriptor [system:9 at /usr/include/boost/asio/detail/reactive_socket_service.hpp:202 in function 'local_endpoint']
[2026-03-12 13:44:17.338] [error]   
[2026-03-12 13:44:17.338] [error]    0# 0x0000572446A23D6F in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:17.338] [error]    1# 0x0000572446A3309A in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:17.338] [error]    2# 0x000076A2D1EECDB4 in /lib/x86_64-linux-gnu/libstdc++.so.6
[2026-03-12 13:44:17.338] [error]    3# 0x000076A2D1A9CAA4 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:17.338] [error]    4# 0x000076A2D1B29C6C in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:17.338] [error]   
[2026-03-12 13:44:17.339] [info]    async_event_server[:5250] Client 192.168.0.98 disconnected (0 connections).
[2026-03-12 13:44:17.339] [info]    [asio] Shutting down global io_context.
[2026-03-12 13:44:17.339] [info]    [asio] Global io_context uninitialized.
[2026-03-12 13:44:17.358] [info]    Screen consumer [1|1728x768] Uninitialized.
[2026-03-12 13:44:17.358] [info]    video_channel[2|1728x768] Uninitializing.
[2026-03-12 13:44:17.368] [info]    video_channel[3|1536x640] Uninitializing.
[2026-03-12 13:44:17.407] [info]    Screen consumer [3|1536x640] Uninitialized.
[2026-03-12 13:44:17.407] [info]    video_channel[4|1536x640] Uninitializing.
[2026-03-12 13:44:17.472] [info]    video_channel[5|1080p5000] Uninitializing.
[2026-03-12 13:44:17.518] [info]    Screen consumer [5|1080p5000] Uninitialized.
[2026-03-12 13:44:17.519] [info]    video_channel[6|1080p5000] Uninitializing.
[2026-03-12 13:44:18.064] [info]    Successfully shutdown CasparCG Server.
[2026-03-12 13:44:23.329] [info]    ############################################################################
[2026-03-12 13:44:23.329] [info]    CasparCG Server is distributed by the Swedish Broadcasting Corporation (SVT)
[2026-03-12 13:44:23.329] [info]    under the GNU General Public License GPLv3 or higher.
[2026-03-12 13:44:23.329] [info]    Please see LICENSE.TXT for details.
[2026-03-12 13:44:23.329] [info]    http://www.casparcg.com/
[2026-03-12 13:44:23.329] [info]    ############################################################################
[2026-03-12 13:44:23.329] [info]    Starting CasparCG Video and Graphics Playout Server 2.5.0 N/A Stable
[2026-03-12 13:44:23.330] [info]    "/opt/casparcg/data/casparcg.config.ftd":
[2026-03-12 13:44:23.330] [info]    -----------------------------------------
[2026-03-12 13:44:23.330] [info]    <?xml version="1.0" encoding="utf-8"?>
[2026-03-12 13:44:23.330] [info]    <configuration>
[2026-03-12 13:44:23.330] [info]       <paths>
[2026-03-12 13:44:23.330] [info]          <media-path>media/</media-path>
[2026-03-12 13:44:23.330] [info]          <log-path disable="false">log/</log-path>
[2026-03-12 13:44:23.330] [info]          <data-path>data/</data-path>
[2026-03-12 13:44:23.330] [info]          <template-path>media/</template-path>
[2026-03-12 13:44:23.330] [info]       </paths>
[2026-03-12 13:44:23.330] [info]       <lock-clear-phrase>secret</lock-clear-phrase>
[2026-03-12 13:44:23.330] [info]       <channels>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>7680x1080</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers>
[2026-03-12 13:44:23.330] [info]                <screen>
[2026-03-12 13:44:23.330] [info]                   <device>1</device>
[2026-03-12 13:44:23.330] [info]                   <x>0</x>
[2026-03-12 13:44:23.330] [info]                   <y>0</y>
[2026-03-12 13:44:23.330] [info]                   <width>7680</width>
[2026-03-12 13:44:23.330] [info]                   <height>1080</height>
[2026-03-12 13:44:23.330] [info]                   <stretch>none</stretch>
[2026-03-12 13:44:23.330] [info]                   <windowed>true</windowed>
[2026-03-12 13:44:23.330] [info]                   <vsync>true</vsync>
[2026-03-12 13:44:23.330] [info]                   <always-on-top>true</always-on-top>
[2026-03-12 13:44:23.330] [info]                   <borderless>true</borderless>
[2026-03-12 13:44:23.330] [info]                </screen>
[2026-03-12 13:44:23.330] [info]             </consumers>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>7680x1080</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers/>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>1080p5000</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers>
[2026-03-12 13:44:23.330] [info]                <screen>
[2026-03-12 13:44:23.330] [info]                   <device>2</device>
[2026-03-12 13:44:23.330] [info]                   <x>7680</x>
[2026-03-12 13:44:23.330] [info]                   <y>0</y>
[2026-03-12 13:44:23.330] [info]                   <width>1920</width>
[2026-03-12 13:44:23.330] [info]                   <height>1080</height>
[2026-03-12 13:44:23.330] [info]                   <stretch>none</stretch>
[2026-03-12 13:44:23.330] [info]                   <windowed>true</windowed>
[2026-03-12 13:44:23.330] [info]                   <vsync>true</vsync>
[2026-03-12 13:44:23.330] [info]                   <always-on-top>true</always-on-top>
[2026-03-12 13:44:23.330] [info]                   <borderless>false</borderless>
[2026-03-12 13:44:23.330] [info]                </screen>
[2026-03-12 13:44:23.330] [info]             </consumers>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>1080p5000</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers/>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>1080p5000</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers>
[2026-03-12 13:44:23.330] [info]                <screen>
[2026-03-12 13:44:23.330] [info]                   <device>3</device>
[2026-03-12 13:44:23.330] [info]                   <x>9600</x>
[2026-03-12 13:44:23.330] [info]                   <y>0</y>
[2026-03-12 13:44:23.330] [info]                   <width>1920</width>
[2026-03-12 13:44:23.330] [info]                   <height>1080</height>
[2026-03-12 13:44:23.330] [info]                   <stretch>none</stretch>
[2026-03-12 13:44:23.330] [info]                   <windowed>true</windowed>
[2026-03-12 13:44:23.330] [info]                   <vsync>true</vsync>
[2026-03-12 13:44:23.330] [info]                   <borderless>false</borderless>
[2026-03-12 13:44:23.330] [info]                </screen>
[2026-03-12 13:44:23.330] [info]             </consumers>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]          <channel>
[2026-03-12 13:44:23.330] [info]             <video-mode>1080p5000</video-mode>
[2026-03-12 13:44:23.330] [info]             <consumers/>
[2026-03-12 13:44:23.330] [info]          </channel>
[2026-03-12 13:44:23.330] [info]       </channels>
[2026-03-12 13:44:23.330] [info]       <video-modes>
[2026-03-12 13:44:23.330] [info]          <video-mode>
[2026-03-12 13:44:23.330] [info]             <id>7680x1080</id>
[2026-03-12 13:44:23.330] [info]             <width>7680</width>
[2026-03-12 13:44:23.330] [info]             <height>1080</height>
[2026-03-12 13:44:23.330] [info]             <time-scale>50000</time-scale>
[2026-03-12 13:44:23.330] [info]             <duration>1000</duration>
[2026-03-12 13:44:23.330] [info]             <cadence>960</cadence>
[2026-03-12 13:44:23.330] [info]          </video-mode>
[2026-03-12 13:44:23.330] [info]       </video-modes>
[2026-03-12 13:44:23.330] [info]       <controllers>
[2026-03-12 13:44:23.330] [info]          <tcp>
[2026-03-12 13:44:23.330] [info]             <port>5250</port>
[2026-03-12 13:44:23.330] [info]             <protocol>AMCP</protocol>
[2026-03-12 13:44:23.330] [info]          </tcp>
[2026-03-12 13:44:23.330] [info]       </controllers>
[2026-03-12 13:44:23.330] [info]       <osc>
[2026-03-12 13:44:23.330] [info]          <port>5253</port>
[2026-03-12 13:44:23.330] [info]       </osc>
[2026-03-12 13:44:23.330] [info]       <amcp>
[2026-03-12 13:44:23.330] [info]          <media-server>
[2026-03-12 13:44:23.330] [info]             <host>localhost</host>
[2026-03-12 13:44:23.330] [info]             <port>8000</port>
[2026-03-12 13:44:23.330] [info]          </media-server>
[2026-03-12 13:44:23.330] [info]       </amcp>
[2026-03-12 13:44:23.330] [info]       <ndi>
[2026-03-12 13:44:23.330] [info]          <auto-load>false</auto-load>
[2026-03-12 13:44:23.330] [info]       </ndi>
[2026-03-12 13:44:23.330] [info]       <decklink/>
[2026-03-12 13:44:23.330] [info]       <html>
[2026-03-12 13:44:23.330] [info]          <enable-gpu>false</enable-gpu>
[2026-03-12 13:44:23.330] [info]       </html>
[2026-03-12 13:44:23.330] [info]    </configuration>
[2026-03-12 13:44:23.330] [info]    -----------------------------------------
[2026-03-12 13:44:23.331] [info]    Initialized video modes.
[2026-03-12 13:44:24.060] [info]    Initializing OpenGL Device (sfml).
[2026-03-12 13:44:24.060] [info]    Initializing OpenGL Device.
[2026-03-12 13:44:24.068] [info]    Initialized OpenGL 4.5.0 NVIDIA 535.288.01 NVIDIA Corporation
[2026-03-12 13:44:24.086] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 1
[2026-03-12 13:44:24.087] [info]    video_channel[1|7680x1080] Successfully Initialized.
[2026-03-12 13:44:24.087] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 2
[2026-03-12 13:44:24.087] [info]    video_channel[2|7680x1080] Successfully Initialized.
[2026-03-12 13:44:24.087] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 3
[2026-03-12 13:44:24.087] [info]    video_channel[3|1080p5000] Successfully Initialized.
[2026-03-12 13:44:24.088] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 4
[2026-03-12 13:44:24.088] [info]    video_channel[4|1080p5000] Successfully Initialized.
[2026-03-12 13:44:24.088] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 5
[2026-03-12 13:44:24.088] [info]    video_channel[5|1080p5000] Successfully Initialized.
[2026-03-12 13:44:24.088] [info]    Initialized OpenGL Accelerated GPU Image Mixer for channel 6
[2026-03-12 13:44:24.088] [info]    video_channel[6|1080p5000] Successfully Initialized.
[2026-03-12 13:44:24.088] [info]    Initialized channels.
[2026-03-12 13:44:24.089] [info]    Initialized command repository.
[2026-03-12 13:44:24.089] [info]    Initialized image module.
[2026-03-12 13:44:24.089] [info]    Initialized ffmpeg module.
[2026-03-12 13:44:24.089] [info]    Initialized oal module.
[2026-03-12 13:44:24.102] [info]    Decklink devices found:
[2026-03-12 13:44:24.102] [info]     - DeckLink 8K Pro [1] (2254678464)
[2026-03-12 13:44:24.102] [info]     - DeckLink 8K Pro [2] (2254678465)
[2026-03-12 13:44:24.102] [info]     - DeckLink 8K Pro [3] (2254678466)
[2026-03-12 13:44:24.102] [info]     - DeckLink 8K Pro [4] (2254678467)
[2026-03-12 13:44:24.102] [info]    Initialized decklink module.
[2026-03-12 13:44:24.102] [info]    Initialized screen module.
[2026-03-12 13:44:24.102] [info]    Initialized newtek module.
[2026-03-12 13:44:24.102] [info]    Initialized artnet module.
[2026-03-12 13:44:24.102] [info]    [html] Using CEF cache path: /opt/casparcg/cef-cache
[2026-03-12 13:44:24.407] [info]    Initialized html module.
[2026-03-12 13:44:24.407] [info]    Initialized modules.
[2026-03-12 13:44:24.407] [info]    Screen consumer [1|7680x1080] Using frame copied to host for rendering.
[2026-03-12 13:44:24.407] [info]    Screen consumer [1|7680x1080] Initialized.
[2026-03-12 13:44:24.408] [info]    Screen consumer [3|1080p5000] Using frame copied to host for rendering.
[2026-03-12 13:44:24.408] [info]    Screen consumer [3|1080p5000] Initialized.
[2026-03-12 13:44:24.408] [info]    Screen consumer [5|1080p5000] Using frame copied to host for rendering.
[2026-03-12 13:44:24.408] [warning] Screen consumer [5|1080p5000] Screen-index is not supported on linux
[2026-03-12 13:44:24.408] [info]    Screen consumer [5|1080p5000] Initialized.
[2026-03-12 13:44:24.408] [info]    Initialized startup producers.
[2026-03-12 13:44:24.408] [info]    Initialized controllers.
[2026-03-12 13:44:24.408] [info]    Initialized osc.
[2026-03-12 13:44:25.228] [info]    Screen consumer [1|7680x1080] Enabled vsync.
[2026-03-12 13:44:25.339] [info]    Screen consumer [3|1080p5000] Enabled vsync.
[2026-03-12 13:44:25.349] [info]    async_event_server[:5250] Accepted connection from 192.168.0.98 (1 connections).
[2026-03-12 13:44:25.350] [info]    Received message from 192.168.0.98: CLS\r\n
[2026-03-12 13:44:25.356] [info]    Sent more than 512 bytes to 192.168.0.98
[2026-03-12 13:44:25.358] [info]    Received message from 192.168.0.98: TLS\r\n
[2026-03-12 13:44:25.359] [info]    Sent message to 192.168.0.98:200 TLS OK\r\n\r\n
[2026-03-12 13:44:25.362] [info]    Received message from 192.168.0.98: VERSION\r\n
[2026-03-12 13:44:25.362] [info]    Sent message to 192.168.0.98:201 VERSION OK\r\n2.5.0 N/A Stable\r\n
[2026-03-12 13:44:25.363] [info]    Received message from 192.168.0.98: VERSION FLASH\r\n
[2026-03-12 13:44:25.363] [info]    Sent message to 192.168.0.98:201 VERSION OK\r\n2.5.0 N/A Stable\r\n
[2026-03-12 13:44:25.363] [info]    Received message from 192.168.0.98: VERSION TEMPLATEHOST\r\n
[2026-03-12 13:44:25.363] [info]    Sent message to 192.168.0.98:201 VERSION OK\r\n2.5.0 N/A Stable\r\n
[2026-03-12 13:44:25.364] [info]    Received message from 192.168.0.98: INFO\r\n
[2026-03-12 13:44:25.364] [info]    Sent message to 192.168.0.98:200 INFO OK\r\n1 7680x1080 PLAYING\r\n2 7680x1080 PLAYING\r\n3 1080p5000 PLAYING\r\n4 1080p5000 PLAYING\r\n5 1080p5000 PLAYING\r\n6 1080p5000 PLAYING\r\n\r\n
[2026-03-12 13:44:25.365] [info]    Received message from 192.168.0.98: INFO PATHS\r\n
[2026-03-12 13:44:25.365] [info]    Sent message to 192.168.0.98:201 INFO PATHS OK\r\n<?xml version="1.0" encoding="utf-8"?>\n<paths>\n   <media-path>media/</media-path>\n   <log-path>log/</log-path>\n   <data-path>data/</data-path>\n   <template-path>/opt/casparcg/media/</template-path>\n   <initial-path>/opt/casparcg/</initial-path>\n</paths>\n\r\n
[2026-03-12 13:44:25.366] [info]    Received message from 192.168.0.98: INFO SYSTEM\r\n
[2026-03-12 13:44:25.366] [info]    Sent message to 192.168.0.98:200 INFO OK\r\n1 7680x1080 PLAYING\r\n2 7680x1080 PLAYING\r\n3 1080p5000 PLAYING\r\n4 1080p5000 PLAYING\r\n5 1080p5000 PLAYING\r\n6 1080p5000 PLAYING\r\n\r\n
[2026-03-12 13:44:25.366] [info]    Received message from 192.168.0.98: INFO CONFIG\r\n
[2026-03-12 13:44:25.367] [info]    Sent more than 512 bytes to 192.168.0.98
[2026-03-12 13:44:25.369] [info]    Received message from 192.168.0.98: INFO 1\r\n
[2026-03-12 13:44:25.369] [info]    Sent more than 512 bytes to 192.168.0.98
[2026-03-12 13:44:25.371] [info]    Received message from 192.168.0.98: INFO 2\r\n
[2026-03-12 13:44:25.371] [info]    Sent message to 192.168.0.98:201 INFO OK\r\n<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>7680x1080</format>\n   <framerate>50</framerate>\n   <framerate>1</framerate>\n</channel>\n\r\n
[2026-03-12 13:44:25.372] [info]    Received message from 192.168.0.98: INFO 3\r\n
[2026-03-12 13:44:25.372] [info]    Sent more than 512 bytes to 192.168.0.98
[2026-03-12 13:44:25.373] [info]    Received message from 192.168.0.98: INFO 4\r\n
[2026-03-12 13:44:25.373] [info]    Sent message to 192.168.0.98:201 INFO OK\r\n<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n   <framerate>50</framerate>\n   <framerate>1</framerate>\n</channel>\n\r\n
[2026-03-12 13:44:25.374] [info]    Received message from 192.168.0.98: INFO 5\r\n
[2026-03-12 13:44:25.375] [info]    Sent more than 512 bytes to 192.168.0.98
[2026-03-12 13:44:25.376] [info]    Received message from 192.168.0.98: INFO 6\r\n
[2026-03-12 13:44:25.376] [info]    Sent message to 192.168.0.98:201 INFO OK\r\n<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n   <framerate>50</framerate>\n   <framerate>1</framerate>\n</channel>\n\r\n
[2026-03-12 13:44:25.385] [info]    Received message from 192.168.0.98: PLAY 6-1 DECKLINK 1\r\n
[2026-03-12 13:44:25.404] [info]    DeckLink 8K Pro [1|1080p5000] Initialized
[2026-03-12 13:44:25.406] [info]    Sent message to 192.168.0.98:202 PLAY OK\r\n
[2026-03-12 13:44:25.407] [info]    Received message from 192.168.0.98: PLAY 6-2 DECKLINK 2\r\n
[2026-03-12 13:44:25.426] [info]    Device may not support video-format: 1080p50
[2026-03-12 13:44:25.490] [error]   Exception: ./src/modules/decklink/producer/decklink_producer.cpp(551): Throw in function caspar::decklink::decklink_producer::decklink_producer(caspar::core::video_format_desc, int, const caspar::spl::shared_ptr<caspar::core::frame_factory>&, const caspar::core::video_format_repository&, std::string, std::string, const std::wstring&, bool, bool)
[2026-03-12 13:44:25.490] [error]   Dynamic exception type: boost::wrapexcept<caspar::caspar_exception>
[2026-03-12 13:44:25.490] [error]   [caspar::tag_msg_info*] = DeckLink 8K Pro [2|1080p5000] Could not enable video input.
[2026-03-12 13:44:25.490] [error]   [caspar::tag_stacktrace_info*] =  0# 0x0000639FD30B1C00 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    1# 0x0000639FD324DD7B in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    2# 0x0000639FD324E604 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    3# 0x0000639FD3091982 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    4# 0x000070F9144A1ED3 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]    5# 0x0000639FD3289E93 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    6# 0x0000639FD324A7CC in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    7# 0x0000639FD309AE5B in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    8# 0x000070F9148ECDB4 in /lib/x86_64-linux-gnu/libstdc++.so.6
[2026-03-12 13:44:25.490] [error]    9# 0x000070F91449CAA4 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]   10# 0x000070F914529C6C in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]   
[2026-03-12 13:44:25.490] [error]   [boost::errinfo_api_function_*] = EnableVideoInput
[2026-03-12 13:44:25.490] [error]   
[2026-03-12 13:44:25.490] [error]    0# 0x0000639FD3013D6F in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    1# 0x0000639FD303A279 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    2# 0x0000639FD328CF08 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    3# 0x0000639FD312EFBE in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    4# 0x0000639FD318D94F in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    5# 0x0000639FD318F6B4 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    6# 0x0000639FD31A31E7 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    7# 0x0000639FD31D1E22 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    8# 0x0000639FD31E5025 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]    9# 0x0000639FD31E5726 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   10# 0x0000639FD31E8374 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   11# 0x0000639FD3091982 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   12# 0x000070F9144A1ED3 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]   13# 0x0000639FD3289E93 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   14# 0x0000639FD31E779C in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   15# 0x0000639FD309AE5B in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.490] [error]   16# 0x000070F9148ECDB4 in /lib/x86_64-linux-gnu/libstdc++.so.6
[2026-03-12 13:44:25.490] [error]   17# 0x000070F91449CAA4 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]   18# 0x000070F914529C6C in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.490] [error]   
[2026-03-12 13:44:25.495] [error]    File not found.
[2026-03-12 13:44:25.495] [info]    Sent message to 192.168.0.98:404 PLAY FAILED\r\n
[2026-03-12 13:44:25.497] [info]    Received message from 192.168.0.98: PLAY 6-3 DECKLINK 1\r\n
[2026-03-12 13:44:25.545] [error]   Exception: ./src/modules/decklink/producer/decklink_producer.cpp(551): Throw in function caspar::decklink::decklink_producer::decklink_producer(caspar::core::video_format_desc, int, const caspar::spl::shared_ptr<caspar::core::frame_factory>&, const caspar::core::video_format_repository&, std::string, std::string, const std::wstring&, bool, bool)
[2026-03-12 13:44:25.545] [error]   Dynamic exception type: boost::wrapexcept<caspar::caspar_exception>
[2026-03-12 13:44:25.545] [error]   [caspar::tag_msg_info*] = DeckLink 8K Pro [1|1080p5000] Could not enable video input.
[2026-03-12 13:44:25.545] [error]   [caspar::tag_stacktrace_info*] =  0# 0x0000639FD30B1C00 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    1# 0x0000639FD324DD7B in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    2# 0x0000639FD324E604 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    3# 0x0000639FD3091982 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    4# 0x000070F9144A1ED3 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.545] [error]    5# 0x0000639FD3289E93 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    6# 0x0000639FD324A7CC in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    7# 0x0000639FD309AE5B in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    8# 0x000070F9148ECDB4 in /lib/x86_64-linux-gnu/libstdc++.so.6
[2026-03-12 13:44:25.545] [error]    9# 0x000070F91449CAA4 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.545] [error]   10# 0x000070F914529C6C in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.545] [error]   
[2026-03-12 13:44:25.545] [error]   [boost::errinfo_api_function_*] = EnableVideoInput
[2026-03-12 13:44:25.545] [error]   
[2026-03-12 13:44:25.545] [error]    0# 0x0000639FD3013D6F in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    1# 0x0000639FD303A279 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    2# 0x0000639FD328CF08 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    3# 0x0000639FD312EFBE in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    4# 0x0000639FD318D94F in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    5# 0x0000639FD318F6B4 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    6# 0x0000639FD31A31E7 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    7# 0x0000639FD31D1E22 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    8# 0x0000639FD31E5025 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]    9# 0x0000639FD31E5726 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]   10# 0x0000639FD31E8374 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]   11# 0x0000639FD3091982 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]   12# 0x000070F9144A1ED3 in /lib/x86_64-linux-gnu/libc.so.6
[2026-03-12 13:44:25.545] [error]   13# 0x0000639FD3289E93 in /usr/bin/casparcg-server-2.5
[2026-03-12 13:44:25.545] [error]   14# 0x0000639FD31E779C