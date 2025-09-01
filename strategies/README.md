Every strategy directory is basically a plugin that will be compiled as a .dll and loaded into the main program.

Every strategies/strategy\_name/CMakeLists.txt should have:
add\_library(MovingAveragePlugin SHARED
    MovingAverage.cpp
    MovingAverage.hpp
)
target\_include\_directories(MovingAveragePlugin PRIVATE
    ${PROJECT\_SOURCE\_DIR}/include
)
set\_target\_properties(MovingAveragePlugin PROPERTIES
    LIBRARY\_OUTPUT\_DIRECTORY ${PLUGIN\_OUTPUT\_DIR}
)
