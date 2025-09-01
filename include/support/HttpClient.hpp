#pragma once
#include <string>
#include <curl/curl.h>   // or whatever your REST backend is

class HttpClient {
	public:
		    // Simple GET example
		    std::string get(const std::string& url);
		    //         // TODO: add post, put, etc.
		             };
