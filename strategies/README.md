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


Strategy plugins are 'dumb' to the infrastructure of the bot. They only receive data. The engine takes care of subscribing to data published on the bus, and then forwarding that data to the strategy plugin. 

In this way, a strategy plugin can be executed on any given ticker symbol. You wouldn't need to write specifics for SPY or BTC into your strategy plugin; you can just configure a plug-and-play strategy combining anything with anything. 





